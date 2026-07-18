// Formatea costos de IA en USD. A diferencia de los formateadores de COP del resto de la app
// (0-2 decimales), un solo llamado puede costar fracciones de centavo, así que usamos más
// decimales para no redondear todo a "$0.00".
export function formatUsdCost(value: number | string | null | undefined): string {
  if (value == null) return "—"
  const n = Number(value)
  if (!Number.isFinite(n)) return "—"
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })
}
