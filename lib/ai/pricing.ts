// Precios en USD por millón de tokens, tarifa estándar del Paid Tier (texto/imagen/PDF; el output
// incluye los tokens de razonamiento). Verificados contra https://ai.google.dev/gemini-api/docs/pricing
// el 2026-09-15. Los tokens crudos siempre se guardan junto al costo calculado, así que el costo
// histórico se puede recalcular si una tarifa cambia.
//
// Conservar las entradas de modelos anteriores: AiCallLog guarda el modelo realmente usado en
// cada llamado, y el costo de esos registros viejos se sigue calculando con su propia tarifa.
type Rate = { inputPerMillionUsd: number; outputPerMillionUsd: number }

// `changes`: tarifas que entran en vigor en una fecha ya anunciada (YYYY-MM-DD, orden ascendente),
// para que un precio promocional no siga aplicándose en silencio después de vencer.
export const MODEL_PRICING: Record<string, Rate & { changes?: Array<Rate & { from: string }> }> = {
  // Tarifa introductoria hasta el 2026-12-31; precio de lista desde el 2027-01-01.
  "gemini-3.6-flash": {
    inputPerMillionUsd: 0.75,
    outputPerMillionUsd: 3.75,
    changes: [{ from: "2027-01-01", inputPerMillionUsd: 1.5, outputPerMillionUsd: 7.5 }],
  },
  "gemini-3.5-flash": { inputPerMillionUsd: 1.5, outputPerMillionUsd: 9.0 },
  "gemini-3.1-flash-lite": { inputPerMillionUsd: 0.25, outputPerMillionUsd: 1.5 },
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number, at: Date = new Date()): number | null {
  const pricing = MODEL_PRICING[model]
  if (!pricing) return null
  const day = at.toISOString().slice(0, 10)
  const rate = (pricing.changes ?? []).filter((c) => c.from <= day).pop() ?? pricing
  return (inputTokens / 1_000_000) * rate.inputPerMillionUsd + (outputTokens / 1_000_000) * rate.outputPerMillionUsd
}
