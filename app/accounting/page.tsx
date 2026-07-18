import { prisma } from "@/lib/db"
import { BaseLayout } from "@/components/base-layout"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { AddAccountingRecordForm } from "./add-form"
import { AccountingTable } from "./table"
import { listOpenInvoices } from "../invoices/actions"
import { listContractors } from "../contractors/actions"
import { listFinancialAccounts } from "../accounts/actions"
import { numberToWords } from "@/lib/number-to-words"
import { derivePaymentMethod } from "@/lib/payment-method"

export default async function AccountingPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")

  const [records, owners, openInvoices, contractors, accounts] = await Promise.all([
    prisma.accountingRecord.findMany({
      where: { userId: user.id },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      include: {
        cashReceipts: { orderBy: { number: "asc" } },
        expenseVoucher: true,
        abono: { include: { invoice: { include: { contractor: { select: { name: true } } } } } },
        account: true,
      },
    }),
    prisma.owner.findMany({
      select: { unit: true, name: true },
      orderBy: { unit: "asc" },
    }),
    listOpenInvoices(),
    listContractors(),
    listFinancialAccounts(),
  ])
  const units = owners.map((o) => o.unit)
  const ownerByUnit = new Map(owners.map((o) => [o.unit, o.name]))
  const contractorById = new Map(contractors.map((c) => [c.id, c]))

  const rows = records.map((r) => {
    return {
    id: r.id,
    concept: r.concept,
    date: r.date.toISOString(),
    income: r.income?.toString() ?? null,
    expenses: r.expenses?.toString() ?? null,
    category: r.category,
    property: r.property,
    categorySource: r.categorySource,
    categoryConfidence: r.categoryConfidence,
    accountId: r.accountId ?? null,
    accountName: r.account?.name ?? null,
    cashReceiptGenerated: r.cashReceiptGenerated,
    paymentProofFileName: r.paymentProofFileName ?? null,
    paymentProofFileUrl: r.paymentProofFileUrl ?? null,
    facturaFileName: r.facturaFileName ?? null,
    facturaFileUrl: r.facturaFileUrl ?? null,
    bankStatementId: r.bankStatementId ?? null,
    bankMovementId: r.bankMovementId ?? null,
    invoiceId: r.abono?.invoiceId ?? null,
    invoiceLabel: r.abono ? `${r.abono.invoice.contractor.name} — ${r.abono.invoice.concept}` : null,
    invoiceNumber: r.abono?.invoice.number ?? null,
    cashReceipts: r.cashReceipts.map((cr) => {
      const amount = cr.amount ?? r.income ?? r.expenses ?? 0
      return {
        id: cr.id,
        number: cr.number,
        accountingRecordId: r.id,
        isIncome: r.income != null,
        paymentMethod: derivePaymentMethod(r.account?.type ?? null),
        date: r.date.toISOString(),
        concept: cr.concept ?? r.concept,
        amount: amount.toString(),
        recipientName: ownerByUnit.get(r.property ?? "") ?? "",
        unit: r.property ?? "",
        amountInWords: numberToWords(Number(amount)),
        siblingCount: r.cashReceipts.length,
      }
    }),
    expenseVoucher: r.expenseVoucher
      ? (() => {
          const contractor = r.expenseVoucher!.contractorId ? contractorById.get(r.expenseVoucher!.contractorId) : undefined
          return {
            id: r.expenseVoucher!.id,
            number: r.expenseVoucher!.number,
            accountingRecordId: r.id,
            contractorId: r.expenseVoucher!.contractorId,
            contractorName: contractor?.name ?? "Contratista eliminado",
            contractorIdNumber: contractor?.idNumber ?? "—",
            date: r.date.toISOString(),
            concept: r.concept,
            amount: (r.expenses ?? r.income ?? 0).toString(),
            accountId: r.accountId ?? null,
            paymentMethod: derivePaymentMethod(r.account?.type ?? null),
          }
        })()
      : null,
    }
  })

  return (
    <BaseLayout wide>
      <div className="flex flex-1 flex-col min-h-0 gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Contabilidad</h1>
          <AddAccountingRecordForm units={units} accounts={accounts} />
        </div>

        <AccountingTable records={rows} units={units} owners={owners} openInvoices={openInvoices} contractors={contractors} accounts={accounts} />
      </div>
    </BaseLayout>
  )
}
