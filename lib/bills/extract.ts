import { z } from "zod"
import { trackedGenerateObject } from "@/lib/ai/tracked-generate-object"

const EXTRACT_TIMEOUT_MS = 60_000

// Same set the bills form and createBill accept for the document itself.
export const BILL_EXTRACTION_MEDIA_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
}

const BillExtractionSchema = z.object({
  isBill: z.boolean(),
  documentKind: z.string().nullable(),
  provider: z.string().nullable(),
  concept: z.string().nullable(),
  amount: z.number().nullable(),
  issueDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  period: z.string().nullable(),
  previousBalance: z.number().nullable(),
  confidence: z.number().min(0).max(1),
})

export type BillExtraction = z.infer<typeof BillExtractionSchema>

const SYSTEM_PROMPT = `Eres un asistente contable de un edificio residencial en Colombia. Vas a leer una
factura de un servicio público o proveedor recurrente (energía CHEC, agua, gas, internet, etc.) que
el edificio tiene que pagar.

isBill: true solo si el documento es una factura o cobro POR PAGAR. Si es un comprobante de pago ya
hecho (p.ej. "Pago exitoso", "Pago PSE", "Valor del Pago", recibo o transferencia bancaria) o
cualquier otro documento, devuelve isBill=false, explica en documentKind qué es (p.ej.
"comprobante de pago PSE") y deja el resto de campos en null.

Si isBill=true, extrae:
- amount: el VALOR TOTAL a pagar ("Valor total", "Total a pagar"). Si la factura suma saldos o meses
  anteriores sin pagar, el total los incluye y ese es el valor correcto. Nunca un subtotal (servicio
  de energía, alumbrado público, consumo), ni el "valor último pago". En Colombia el punto es
  separador de miles: "$186.181" es 186181. Devuelve solo el número entero en pesos.
- issueDate: fecha de expedición de la factura, formato YYYY-MM-DD. En facturas CHEC recientes es
  "Fecha expedición de factura"; en el formato anterior es la fecha de "Factura del mes de"
  (p.ej. "15/OCT/2025" → 2025-10-15). NO la confundas con "Fecha de lectura", "Fecha último pago",
  "Consumo desde - hasta" ni "Fecha máxima de pago".
- dueDate: "Fecha máxima de pago" o fecha límite de pago, formato YYYY-MM-DD.
- period: el mes que se factura, en español y minúsculas, p.ej. "junio 2026". CHEC reciente lo
  muestra como "Período JUN/2026"; en el formato anterior tomá el mes de "Factura del mes de".
- previousBalance: "Saldo anterior" que está sumado dentro del total, como número entero en pesos.
  null si no hay o es $0.
- provider: nombre corto del proveedor tal como se le conoce (p.ej. "CHEC" para Central
  Hidroeléctrica de Caldas).
- concept: descripción breve con el patrón "Factura {servicio} {proveedor} {period}", p.ej.
  "Factura energía CHEC junio 2026". Formato de oración normal, nunca en mayúscula sostenida.

Si un dato no aparece claramente en el documento, devuélvelo null en vez de adivinar.
confidence: qué tan seguro estás de la lectura en general (0 a 1).`

// Some bills print everything in ALL CAPS — same safeguard as lib/invoices/extract.ts.
function normalizeIfShouting(text: string | null): string | null {
  if (!text) return text
  const hasLetters = /\p{L}/u.test(text)
  if (!hasLetters || text !== text.toUpperCase()) return text
  const lower = text.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** A real calendar date in YYYY-MM-DD, or null (rejects e.g. "2026-02-31"). */
function validIsoDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(`${value}T00:00:00Z`)
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null
}

function positiveAmount(value: number | null): number | null {
  return value != null && isFinite(value) && value > 0 ? Math.round(value) : null
}

function formatCop(value: number): string {
  return "$" + value.toLocaleString("es-CO", { maximumFractionDigits: 0 })
}

/**
 * Suggested notes for a freshly extracted bill: what the Bill model has no column for but still
 * matters when paying it — arrears folded into the total. (The payment deadline has its own
 * Bill.dueDate column.)
 */
export function buildBillNotes(data: Pick<BillExtraction, "previousBalance">): string | null {
  return data.previousBalance ? `Incluye saldo anterior de ${formatCop(data.previousBalance)}` : null
}

export async function extractBillFields(
  buffer: Buffer,
  mediaType: string,
  opts: { userId: string }
): Promise<{ ok: boolean; data: BillExtraction | null; error?: string }> {
  try {
    const { object } = await trackedGenerateObject(
      {
        schema: BillExtractionSchema,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "file", data: buffer.toString("base64"), mediaType },
              { type: "text", text: "Extrae los datos de esta factura." },
            ],
          },
        ],
      },
      { userId: opts.userId, feature: "bill_extraction", itemCount: 1 },
      { timeoutMs: EXTRACT_TIMEOUT_MS }
    )

    if (!object.isBill) {
      return {
        ok: true,
        data: {
          ...object,
          provider: null, concept: null, amount: null, issueDate: null,
          dueDate: null, period: null, previousBalance: null,
        },
      }
    }

    // Defense in depth, same as the other extractors: the Zod schema only constrains shape, so
    // re-validate every value that later lands in a form field or a date input.
    return {
      ok: true,
      data: {
        ...object,
        concept: normalizeIfShouting(object.concept?.trim() || null),
        amount: positiveAmount(object.amount),
        issueDate: validIsoDate(object.issueDate),
        dueDate: validIsoDate(object.dueDate),
        previousBalance: positiveAmount(object.previousBalance),
      },
    }
  } catch (err) {
    console.error("[extractBillFields] LLM extraction failed:", err)
    return { ok: false, data: null, error: err instanceof Error ? err.message : String(err) }
  }
}
