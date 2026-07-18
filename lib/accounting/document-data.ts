import { numberToWords } from "@/lib/number-to-words"
import { derivePaymentMethod } from "@/lib/payment-method"

export type PaymentProofRow = {
  id: string
  fileName: string
}

export type CashReceiptData = {
  id: string
  number: number
  accountingRecordId: string
  isIncome: boolean
  recipientName: string
  unit: string
  date: string
  concept: string
  amount: string
  amountInWords: string
  paymentMethod: string
}

export type ExpenseVoucherData = {
  id: string
  number: number
  accountingRecordId: string
  contractorId: string | null
  contractorName: string
  contractorIdNumber: string
  date: string
  concept: string
  amount: string
  accountId: string | null
  paymentMethod: string
}

export function buildReceiptData(
  cr: { id: string; number: number; amount: { toString(): string } | null; concept: string | null },
  record: { id: string; date: Date; concept: string; income: { toString(): string } | null; expenses: { toString(): string } | null; property: string | null; account: { type: string } | null },
  recipientName: string
): CashReceiptData {
  const rawAmount = cr.amount ?? record.income ?? record.expenses ?? 0
  const concept = cr.concept ?? record.concept
  return {
    id: cr.id,
    number: cr.number,
    accountingRecordId: record.id,
    isIncome: record.income != null,
    paymentMethod: derivePaymentMethod(record.account?.type ?? null),
    date: record.date.toISOString(),
    concept,
    amount: rawAmount.toString(),
    recipientName,
    unit: record.property ?? "",
    amountInWords: numberToWords(Number(rawAmount)),
  }
}

export function buildVoucherData(
  v: { id: string; number: number; contractorId: string | null },
  record: { id: string; date: Date; concept: string; income: { toString(): string } | null; expenses: { toString(): string } | null; accountId: string | null; account: { type: string } | null },
  contractor: { name: string; idNumber: string } | null
): ExpenseVoucherData {
  const rawAmount = record.expenses ?? record.income ?? 0

  return {
    id: v.id,
    number: v.number,
    accountingRecordId: record.id,
    contractorId: v.contractorId,
    contractorName: contractor?.name ?? "Contratista eliminado",
    contractorIdNumber: contractor?.idNumber ?? "—",
    date: record.date.toISOString(),
    concept: record.concept,
    amount: rawAmount.toString(),
    accountId: record.accountId,
    paymentMethod: derivePaymentMethod(record.account?.type ?? null),
  }
}
