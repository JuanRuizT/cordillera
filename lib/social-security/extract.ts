import { z } from "zod"
import { trackedGenerateObject } from "@/lib/ai/tracked-generate-object"

const EXTRACT_TIMEOUT_MS = 60_000

// Same NIT the cash receipts print (app/accounting/cash-receipt-modal.tsx), digits only, no DV.
export const BUILDING_NIT = "902000058"

export const SOCIAL_SECURITY_MEDIA_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
}

const SocialSecurityExtractionSchema = z.object({
  isPlanilla: z.boolean(),
  documentKind: z.string().nullable(),
  planillaNumber: z.string().nullable(),
  period: z.string().nullable(),
  paidDate: z.string().nullable(),
  total: z.number().nullable(),
  pension: z.number().nullable(),
  health: z.number().nullable(),
  risk: z.number().nullable(),
  compensationFund: z.number().nullable(),
  employerNit: z.string().nullable(),
  affiliateName: z.string().nullable(),
  affiliateIdNumber: z.string().nullable(),
  confidence: z.number().min(0).max(1),
})

export type SocialSecurityExtraction = z.infer<typeof SocialSecurityExtractionSchema>

const SYSTEM_PROMPT = `Eres un asistente contable de un edificio en Colombia. Vas a leer una planilla de
aportes a seguridad social (PILA / autoliquidación, por ejemplo de SuAporte, Enlace Operativo o
Aportes en Línea) que el edificio pagó como empleador.

isPlanilla: true solo si el documento es una planilla o autoliquidación de aportes. Si es otra cosa
(comprobante de transferencia, factura, cuenta de cobro, etc.), devuelve isPlanilla=false, explica en
documentKind qué es y deja el resto de campos en null.

Si isPlanilla=true, extrae:
- planillaNumber: "Número Planilla", solo dígitos.
- period: el "Periodo Cotización" en formato YYYY-MM (p.ej. "septiembre de 2026" → "2026-09"). NO
  confundir con el "Periodo Servicio", que suele ser el mes siguiente.
- paidDate: la fecha de pago que aparece como "PAGADO dd/mm/yyyy", en formato YYYY-MM-DD. NO la
  "Fecha creación reporte".
- total: el "TOTAL FINAL" a pagar en pesos.
- pension, health, risk, compensationFund: los totales de "Aportes Pensión", "Aportes Salud",
  "Aportes Riesgos" y "Aportes Cajas". Si un valor es $0 devuelve 0, no null.
- employerNit: documento del aportante (empleador), solo dígitos, sin dígito de verificación.
- affiliateName / affiliateIdNumber: nombre y cédula (solo dígitos) del afiliado. Si hay varios
  afiliados, el primero.
En Colombia el punto es separador de miles: "$ 96.900" es 96900. Devuelve los montos como números
enteros en pesos. Si un dato no aparece claramente, devuélvelo null en vez de adivinar.
confidence: qué tan seguro estás de la lectura en general (0 a 1).`

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** A real calendar date in YYYY-MM-DD, or null (rejects e.g. "2026-02-31"). */
function validIsoDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(`${value}T00:00:00Z`)
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null
}

function amount(value: number | null, { allowZero }: { allowZero: boolean }): number | null {
  if (value == null || !isFinite(value)) return null
  if (value < 0 || (!allowZero && value === 0)) return null
  return Math.round(value)
}

function digits(value: string | null): string | null {
  const d = value?.replace(/\D/g, "") ?? ""
  return d.length > 0 ? d : null
}

// PILA prints names in capitals ("DORA ALICIA MORA MONTOYA") — store them as a readable name.
function titleCase(value: string | null): string | null {
  const t = value?.trim()
  if (!t) return null
  return t.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase())
}

export async function extractSocialSecurityFields(
  buffer: Buffer,
  mediaType: string,
  opts: { userId: string }
): Promise<{ ok: boolean; data: SocialSecurityExtraction | null; error?: string }> {
  try {
    const { object } = await trackedGenerateObject(
      {
        schema: SocialSecurityExtractionSchema,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "file", data: buffer.toString("base64"), mediaType },
              { type: "text", text: "Extrae los datos de esta planilla de seguridad social." },
            ],
          },
        ],
      },
      { userId: opts.userId, feature: "social_security_extraction", itemCount: 1 },
      { timeoutMs: EXTRACT_TIMEOUT_MS }
    )

    if (!object.isPlanilla) {
      return {
        ok: true,
        data: {
          ...object,
          planillaNumber: null, period: null, paidDate: null, total: null, pension: null, health: null,
          risk: null, compensationFund: null, employerNit: null, affiliateName: null, affiliateIdNumber: null,
        },
      }
    }

    // Defense in depth, same as the other extractors: re-validate everything that lands in a form.
    return {
      ok: true,
      data: {
        ...object,
        planillaNumber: digits(object.planillaNumber),
        period: object.period && PERIOD_RE.test(object.period) ? object.period : null,
        paidDate: validIsoDate(object.paidDate),
        total: amount(object.total, { allowZero: false }),
        pension: amount(object.pension, { allowZero: true }),
        health: amount(object.health, { allowZero: true }),
        risk: amount(object.risk, { allowZero: true }),
        compensationFund: amount(object.compensationFund, { allowZero: true }),
        employerNit: digits(object.employerNit),
        affiliateName: titleCase(object.affiliateName),
        affiliateIdNumber: digits(object.affiliateIdNumber),
      },
    }
  } catch (err) {
    console.error("[extractSocialSecurityFields] LLM extraction failed:", err)
    return { ok: false, data: null, error: err instanceof Error ? err.message : String(err) }
  }
}
