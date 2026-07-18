// Precios en USD por millón de tokens. No confirmados contra la documentación oficial de
// Google (no está disponible al momento de escribir esto) — verificar antes de depender de
// esto para reportes financieros reales. Los tokens crudos siempre se guardan junto al costo
// calculado, así que el costo histórico se puede recalcular si la tarifa real es distinta.
export const MODEL_PRICING: Record<string, { inputPerMillionUsd: number; outputPerMillionUsd: number }> = {
  "gemini-3.1-flash-lite": { inputPerMillionUsd: 0.25, outputPerMillionUsd: 1.5 },
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const pricing = MODEL_PRICING[model]
  if (!pricing) return null
  return (inputTokens / 1_000_000) * pricing.inputPerMillionUsd + (outputTokens / 1_000_000) * pricing.outputPerMillionUsd
}
