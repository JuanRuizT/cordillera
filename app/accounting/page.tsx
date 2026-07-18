import { prisma } from "@/lib/db"
import { BaseLayout } from "@/components/base-layout"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { AddAccountingRecordForm } from "./add-form"
import { AccountingTable } from "./table"
import { listOpenInvoices } from "../invoices/actions"
import { listContractors } from "../contractors/actions"
import { listFinancialAccounts } from "../accounts/actions"
import { listLinkableBills } from "../bills/actions"
import { listSocialSecurityLinkOptions } from "../social-security/actions"
import { socialSecurityLabel } from "@/lib/social-security/document-data"
import { numberToWords } from "@/lib/number-to-words"
import { derivePaymentMethod } from "@/lib/payment-method"

export default async function AccountingPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")

  const [records, owners, openInvoices, contractors, accounts, bills, socialSecurityOptions] = await Promise.all([
    prisma.accountingRecord.findMany({
      where: { userId: user.id },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      include: {
        cashReceipts: { orderBy: { number: "asc" } },
        expenseVoucher: true,
        abono: { include: { invoice: { include: { contractor: { select: { name: true } } } } } },
        bill: { select: { id: true, concept: true, fileName: true, fileUrl: true } },
        socialSecurityPayment: { select: { id: true, kind: true, period: true, fileName: true, fileUrl: true } },
        account: true,
        paymentProofs: { select: { id: true, fileName: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.owner.findMany({
      select: { unit: true, name: true },
      orderBy: { unit: "asc" },
    }),
    listOpenInvoices(),
    listContractors(),
    listFinancialAccounts(),
    listLinkableBills(),
    listSocialSecurityLinkOptions(),
  ])
  const units = owners.map((o) => o.unit)
  const ownerByUnit = new Map(owners.map((o) => [o.unit, o.name]))
  const contractorById = new Map(contractors.map((c) => [c.id, c]))

  const rows = records.map((r) => {
    // A handful of older records ended up with a null `date` despite the column being required
    // in the schema (data drift predating current create/update validation) — fall back to
    // createdAt rather than letting one bad row 500 the whole page; the date is still editable
    // via double-click once it renders.
    const safeDate = r.date ?? r.createdAt
    return {
    id: r.id,
    concept: r.concept,
    date: safeDate.toISOString(),
    income: r.income?.toString() ?? null,
    expenses: r.expenses?.toString() ?? null,
    category: r.category,
    property: r.property,
    categorySource: r.categorySource,
    categoryConfidence: r.categoryConfidence,
    accountId: r.accountId ?? null,
    accountName: r.account?.name ?? null,
    cashReceiptGenerated: r.cashReceiptGenerated,
    supportNotRequired: r.supportNotRequired,
    supportNotRequiredReason: r.supportNotRequiredReason,
    paymentProofs: r.paymentProofs,
    billId: r.bill?.id ?? null,
    billConcept: r.bill?.concept ?? null,
    // Only the name travels to the client; the file itself is served through /api/bills/[id]/document.
    billFileName: r.bill?.fileUrl ? (r.bill.fileName ?? "factura") : null,
    socialSecurityId: r.socialSecurityPayment?.id ?? null,
    socialSecurityLabel: r.socialSecurityPayment ? socialSecurityLabel(r.socialSecurityPayment.kind, r.socialSecurityPayment.period) : null,
    // Same as billFileName: only the name reaches the client; the PDF goes through /api/social-security/[id]/document.
    socialSecurityFileName: r.socialSecurityPayment?.fileUrl ? (r.socialSecurityPayment.fileName ?? "planilla") : null,
    bankStatementId: r.bankStatementId ?? null,
    bankMovementId: r.bankMovementId ?? null,
    parentRecordId: r.parentRecordId ?? null,
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
        date: safeDate.toISOString(),
        concept: cr.concept ?? r.concept,
        amount: amount.toString(),
        recipientName: ownerByUnit.get(r.property ?? "") ?? "",
        unit: r.property ?? "",
        amountInWords: numberToWords(Number(amount)),
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
            date: safeDate.toISOString(),
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
    <BaseLayout wide selfManagedScroll>
      <div className="flex flex-1 flex-col min-h-0 gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Contabilidad</h1>
          <AddAccountingRecordForm units={units} accounts={accounts} />
        </div>

        <AccountingTable records={rows} units={units} owners={owners} openInvoices={openInvoices} contractors={contractors} accounts={accounts} bills={bills} socialSecurityOptions={socialSecurityOptions} />
      </div>
    </BaseLayout>
  )
}
