// La forma de pago de un comprobante de egreso se deduce del tipo de la cuenta financiera
// ligada al registro contable: "cash" es efectivo, "bank" (o sin cuenta) es transferencia.
export function derivePaymentMethod(accountType: string | null | undefined): string {
  return accountType == null || accountType === "cash" ? "Efectivo" : "Transferencia Bancaria"
}
