import { z } from "zod"
import { google } from "@ai-sdk/google"
import { trackedGenerateObject } from "@/lib/ai/tracked-generate-object"

const EXTRACT_TIMEOUT_MS = 30_000
// Kept in sync with VALID_RETENTION_RATES in app/invoices/actions.ts.
const VALID_RETENTION_RATES = [4, 6]

const InvoiceExtractionSchema = z.object({
  concept: z.string().nullable(),
  totalAmount: z.number().nullable(),
  date: z.string().nullable(),
  retentionRate: z.number().nullable(),
  bankInfo: z.string().nullable(),
  contractorName: z.string().nullable(),
  contractorIdNumber: z.string().nullable(),
  confidence: z.number().min(0).max(1),
})

export type InvoiceExtraction = z.infer<typeof InvoiceExtractionSchema>

// Cuentas de cobro often have their text in ALL CAPS. Normalize to a readable sentence instead
// of shouting — but only when the model didn't already follow the prompt instruction to do
// this itself, and only text that's actually all-uppercase (leave normal mixed-case text as-is).
function normalizeIfShouting(text: string | null): string | null {
  if (!text) return text
  const hasLetters = /\p{L}/u.test(text)
  if (!hasLetters || text !== text.toUpperCase()) return text
  const lower = text.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

export async function extractInvoiceFields(
  buffer: Buffer,
  opts: { userId: string }
): Promise<{ ok: boolean; data: InvoiceExtraction | null; error?: string }> {
  try {
    const { object } = await trackedGenerateObject(
      {
        model: google("gemini-3.1-flash-lite"),
        schema: InvoiceExtractionSchema,
        system:
          "Eres un asistente contable en Colombia. Vas a leer el PDF de una 'cuenta de cobro' " +
          "que un contratista le envía a un conjunto residencial para que le paguen un trabajo " +
          "o servicio. Extrae: concept (breve descripción del trabajo/servicio cobrado), " +
          "totalAmount (monto total en pesos colombianos, solo el número), date (fecha del " +
          "documento, formato YYYY-MM-DD), retentionRate (4 o 6 si el documento menciona " +
          "retención en la fuente, null si no la menciona — nunca inventes otro valor), " +
          "bankInfo (cuenta bancaria para el pago, si aparece), contractorName (nombre o razón " +
          "social de quien cobra), contractorIdNumber (cédula o NIT de quien cobra, solo " +
          "dígitos). El concepto y los datos bancarios deben quedar en formato de oración normal " +
          "(mayúscula solo al inicio y en nombres propios) — nunca en mayúscula sostenida, aunque " +
          "el documento original los tenga así. Si un dato no aparece claramente en el documento, " +
          "devuélvelo null en vez de adivinar. confidence: qué tan seguro estás de la lectura en " +
          "general (0 a 1).",
        messages: [
          {
            role: "user",
            content: [
              { type: "file", data: buffer.toString("base64"), mediaType: "application/pdf" },
              { type: "text", text: "Extrae los datos de esta cuenta de cobro." },
            ],
          },
        ],
        abortSignal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
      },
      { userId: opts.userId, feature: "invoice_extraction", itemCount: 1 }
    )

    // Defense in depth, same as lib/accounting/classify.ts: never trust a model value outside
    // what's actually valid in the app, even though the Zod schema already constrained shape.
    const retentionRate =
      object.retentionRate != null && VALID_RETENTION_RATES.includes(object.retentionRate)
        ? object.retentionRate
        : null

    return {
      ok: true,
      data: {
        ...object,
        retentionRate,
        concept: normalizeIfShouting(object.concept),
        bankInfo: normalizeIfShouting(object.bankInfo),
      },
    }
  } catch (err) {
    console.error("[extractInvoiceFields] LLM extraction failed:", err)
    return { ok: false, data: null, error: err instanceof Error ? err.message : String(err) }
  }
}
