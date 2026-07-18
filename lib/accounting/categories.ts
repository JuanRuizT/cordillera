export interface CategoryDefinition {
  name: string
  description: string
  // Which side of the ledger this category can ever legitimately appear on — omitted means it
  // can be either (e.g. an opening balance). Used to catch a model proposing, say, "Cuota
  // extraordinaria" (money coming in from an owner) for a movement that's actually money going
  // out — a sign/category mismatch the model can produce even with the amount in front of it.
  sign?: "income" | "expense"
}

export const ACCOUNTING_CATEGORY_DEFINITIONS: readonly CategoryDefinition[] = [
  { name: "Inicio", description: "Saldo inicial/apertura. Rara vez aplica a un movimiento individual." },
  { name: "Intereses", description: "Intereses de ahorros (p.ej. 'ABONO INTERESES AHORROS'). Siempre ingreso, sin propiedad.", sign: "income" },
  { name: "Pago Administración", description: "Cuota mensual de administración pagada por un propietario. El valor debe ser exactamente $300.000 o $400.000 para apartamentos, o $50.000 para el Local Comercial (unidad más pequeña, paga menos) — cualquier otro monto pagado por un propietario NO es esta categoría, ver 'Cuota extraordinaria'.", sign: "income" },
  { name: "Impuesto", description: "4x1000 (IMPTO GOBIERNO 4X1000), retenciones DIAN, PAGO PSE IMPUESTO DIAN.", sign: "expense" },
  { name: "Egreso", description: "Gasto operativo general sin categoría más específica: cuota de manejo de tarjeta, pagos a proveedores.", sign: "expense" },
  { name: "Cuota extraordinaria", description: "Pago de un propietario que no coincide con el valor exacto de la cuota mensual de administración que le corresponde a su propiedad ($300.000/$400.000 apartamentos, $50.000 Local Comercial) — p.ej. $867.000. Cualquier monto distinto cae acá, no en 'Pago Administración'.", sign: "income" },
  { name: "Facturas", description: "Servicios públicos/proveedores recurrentes, p.ej. pago CHEC (energía) vía PSE.", sign: "expense" },
  { name: "Retención en la fuente", description: "Retención en la fuente practicada sobre el pago de una cuenta de cobro a un contratista — se liga a esa cuenta de cobro específica. Distinta de 'Impuesto', que es para 4x1000 u otros impuestos generales no ligados a una cuenta de cobro puntual.", sign: "expense" },
  { name: "Retiro en Efectivo", description: "Retiro de efectivo del banco (cajero automático o ventanilla), p.ej. 'RETIRO CAJERO'. Es un traslado banco→caja física, no un gasto final a un tercero — nunca lleva propiedad.", sign: "expense" },
] as const

export const ACCOUNTING_CATEGORIES = ACCOUNTING_CATEGORY_DEFINITIONS.map((c) => c.name)

export const ACCOUNTING_CATEGORY_SIGN: ReadonlyMap<string, "income" | "expense"> = new Map(
  ACCOUNTING_CATEGORY_DEFINITIONS.filter((c) => c.sign != null).map((c) => [c.name, c.sign!])
)
