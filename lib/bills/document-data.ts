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
  // Set when this bill was paid inside a later one ("Pagada en otra factura") instead of on its own.
  paidInBill: { id: string; concept: string; date: string; accountingRecordId: string | null } | null
  status: BillStatus
  createdAt: string
  updatedAt: string
}

type PaymentRecord = { date: Date; expenses: { toString(): string } | null }

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
  accountingRecord?: PaymentRecord | null
  paidInBill?: { id: string; concept: string; date: Date; accountingRecordId: string | null; accountingRecord?: PaymentRecord | null } | null
  createdAt: Date
  updatedAt: Date
}

// A bill's status is derived, never stored: "pagada" once it's linked to the AccountingRecord
// that paid it, "pendiente" otherwise. Unlike Cuentas de Cobro (Invoice/Abono), there's no
// "parcial" state — a bill is always paid in one shot.
//
// A bill carried into a later one (paidInBill) has no payment of its own: it's "pagada" — fully,
// with that later bill's payment date — once the later bill is paid, and stays "pendiente" until then.
export function toBillData(b: BillRecord): BillData {
  // Same rule as toInvoiceData: what was paid is the linked record's egreso. Rounded to cents so
  // two Decimal(15,2) values never leave float noise like 11180.000000001 in the difference.
  const amount = Number(b.amount)
  const carriedPayment = !b.accountingRecordId && b.paidInBill?.accountingRecordId ? b.paidInBill.accountingRecord ?? null : null
  const paid = b.accountingRecord
    ? Number(b.accountingRecord.expenses ?? 0)
    : carriedPayment ? amount : 0
  const pending = Math.round((amount - paid) * 100) / 100
  const paymentRecord = b.accountingRecord ?? carriedPayment
  return {
    id: b.id,
    concept: b.concept,
    date: b.date.toISOString(),
    dueDate: b.dueDate?.toISOString() ?? null,
    // Derived like status, never stored: the date of the AccountingRecord that paid the bill, so it
    // can't drift from Contabilidad when that record's date is corrected or the link changes.
    paymentDate: paymentRecord?.date.toISOString() ?? null,
    paidAmount: paid.toString(),
    pendingAmount: pending.toString(),
    amount: b.amount.toString(),
    fileName: b.fileName,
    fileUrl: b.fileUrl,
    notes: b.notes,
    accountingRecordId: b.accountingRecordId,
    paidInBill: b.paidInBill
      ? {
          id: b.paidInBill.id,
          concept: b.paidInBill.concept,
          date: b.paidInBill.date.toISOString(),
          accountingRecordId: b.paidInBill.accountingRecordId,
        }
      : null,
    status: b.accountingRecordId || carriedPayment ? "pagada" : "pendiente",
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  }
}
