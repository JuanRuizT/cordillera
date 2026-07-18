import { BaseLayout } from "@/components/base-layout"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { AddInvoiceForm } from "./add-invoice-form"
import { InvoicesTable } from "./invoices-table"
import { listInvoices } from "./actions"
import { listContractors } from "../contractors/actions"

export default async function InvoicesPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const [invoices, contractors] = await Promise.all([listInvoices(), listContractors()])

  return (
    <BaseLayout wide>
      <div className="flex flex-col gap-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Cuentas de Cobro</h1>
            <p className="text-sm text-muted-foreground">
              {invoices.length} {invoices.length === 1 ? "cuenta de cobro" : "cuentas de cobro"}
            </p>
          </div>
          <AddInvoiceForm contractors={contractors} />
        </div>

        <InvoicesTable invoices={invoices} contractors={contractors} />
      </div>
    </BaseLayout>
  )
}
