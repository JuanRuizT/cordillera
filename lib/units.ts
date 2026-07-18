// How a unit is SHOWN in the accounting UI: "Apartamento 201" → "201" ("Local Comercial" is left
// as is). Display only — the stored value (Owner.unit, AccountingRecord.property) keeps the full
// name, because cash receipts, Paz y Salvo and the AI classifier all read and print it.
export function formatUnitLabel(unit: string): string {
  return unit.replace(/^apartamento\s+/i, "")
}
