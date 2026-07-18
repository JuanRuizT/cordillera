// Retención en la fuente belongs to the Cuenta de Cobro (Invoice) total. The amount
// actually disbursed to the contractor via egresos/abonos is the net (total − retención).
// `pending` tracks the full total, not just the net: the retención isn't paid to the
// contractor, but it's still owed (to the DIAN) until declared, so it stays outstanding.
export function computeInvoiceFinancials(totalAmount: number, retentionRate: number | null, paid: number) {
  const retentionAmount = retentionRate ? Math.round((totalAmount * retentionRate) / 100) : 0
  const netAmount = totalAmount - retentionAmount
  const pending = totalAmount - paid
  return { retentionAmount, netAmount, pending }
}
