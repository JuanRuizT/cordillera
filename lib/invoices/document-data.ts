import { computeInvoiceFinancials } from "@/lib/invoice-financials"

export type InvoiceData = {
  id: string
  number: number | null
  contractorId: string
  contractorName: string
  contractorIdNumber: string
  date: string
  concept: string
  totalAmount: string
  retentionRate: number | null
  retentionAmount: string
  netAmount: string
  paid: string
  pending: string
  fileName: string | null
  fileUrl: string | null
  notes: string | null
  abonos: Array<{ id: string; date: string; amount: string; accountingRecordId: string | null; hasPaymentProof: boolean }>
}

type AbonoWithRecord = {
  id: string
  date: Date | null
  amount: { toString(): string } | null
  accountingRecordId: string | null
  accountingRecord: {
    date: Date
    expenses: { toString(): string } | null
    paymentProofs: { id: string }[]
  } | null
}

export type InvoiceWithAbonos = {
  id: string
  number: number | null
  contractorId: string
  contractor: { name: string; idNumber: string }
  date: Date
  concept: string
  totalAmount: { toString(): string }
  retentionRate: { toString(): string } | null
  fileName: string | null
  fileUrl: string | null
  notes: string | null
  abonos: AbonoWithRecord[]
}

// The abono's own date/amount are only used for manual abonos (no linked record) — the DB
// CHECK constraint guarantees they're set whenever accountingRecordId is null.
export function toInvoiceData(inv: InvoiceWithAbonos): InvoiceData {
  const total = Number(inv.totalAmount)
  const rate = inv.retentionRate != null ? Number(inv.retentionRate) : null
  const paid = inv.abonos.reduce(
    (s, a) => s + (a.accountingRecord ? Number(a.accountingRecord.expenses ?? 0) : Number(a.amount!)),
    0
  )
  const { retentionAmount, netAmount, pending } = computeInvoiceFinancials(total, rate, paid)
  return {
    id: inv.id,
    number: inv.number,
    contractorId: inv.contractorId,
    contractorName: inv.contractor.name,
    contractorIdNumber: inv.contractor.idNumber,
    date: inv.date.toISOString(),
    concept: inv.concept,
    totalAmount: total.toString(),
    retentionRate: rate,
    retentionAmount: retentionAmount.toString(),
    netAmount: netAmount.toString(),
    paid: paid.toString(),
    pending: pending.toString(),
    fileName: inv.fileName,
    fileUrl: inv.fileUrl,
    notes: inv.notes,
    abonos: inv.abonos.map((a) => ({
      id: a.id,
      date: (a.accountingRecord?.date ?? a.date!).toISOString(),
      amount: (a.accountingRecord ? (a.accountingRecord.expenses ?? 0) : a.amount!).toString(),
      accountingRecordId: a.accountingRecordId,
      hasPaymentProof: (a.accountingRecord?.paymentProofs.length ?? 0) > 0,
    })),
  }
}
