export type BillStatus = "pendiente" | "pagada"

export type BillData = {
  id: string
  concept: string
  date: string
  dueDate: string | null
  paymentDate: string | null
  paidAmount: string // egreso of the linked accounting record; "0" when unlinked
  pendingAmount: string // amount − paidAmount; negative when more was paid than billed
  amount: string
  fileName: string | null
  fileUrl: string | null
  notes: string | null
  accountingRecordId: string | null
  status: BillStatus
  createdAt: string
  updatedAt: string
}

export type BillRecord = {
  id: string
  concept: string
  date: Date
  dueDate: Date | null
  amount: { toString(): string }
  fileName: string | null
  fileUrl: string | null
  notes: string | null
  accountingRecordId: string | null
  accountingRecord?: { date: Date; expenses: { toString(): string } | null } | null
  createdAt: Date
  updatedAt: Date
}

// A bill's status is derived, never stored: "pagada" once it's linked to the AccountingRecord
// that paid it, "pendiente" otherwise. Unlike Cuentas de Cobro (Invoice/Abono), there's no
// "parcial" state — a bill is always paid in one shot.
export function toBillData(b: BillRecord): BillData {
  // Same rule as toInvoiceData: what was paid is the linked record's egreso. Rounded to cents so
  // two Decimal(15,2) values never leave float noise like 11180.000000001 in the difference.
  const amount = Number(b.amount)
  const paid = b.accountingRecord ? Number(b.accountingRecord.expenses ?? 0) : 0
  const pending = Math.round((amount - paid) * 100) / 100
  return {
    id: b.id,
    concept: b.concept,
    date: b.date.toISOString(),
    dueDate: b.dueDate?.toISOString() ?? null,
    // Derived like status, never stored: the date of the AccountingRecord that paid the bill, so it
    // can't drift from Contabilidad when that record's date is corrected or the link changes.
    paymentDate: b.accountingRecord?.date.toISOString() ?? null,
    paidAmount: paid.toString(),
    pendingAmount: pending.toString(),
    amount: b.amount.toString(),
    fileName: b.fileName,
    fileUrl: b.fileUrl,
    notes: b.notes,
    accountingRecordId: b.accountingRecordId,
    status: b.accountingRecordId ? "pagada" : "pendiente",
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  }
}
