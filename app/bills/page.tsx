import { BaseLayout } from "@/components/base-layout"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { AddBillForm } from "./add-bill-form"
import { BillsTable } from "./bills-table"
import { listBills } from "./actions"

export default async function BillsPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const bills = await listBills()

  return (
    <BaseLayout wide selfManagedScroll>
      <div className="flex flex-1 flex-col min-h-0 gap-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Facturas</h1>
            <p className="text-sm text-muted-foreground">
              {bills.length} {bills.length === 1 ? "factura" : "facturas"}
            </p>
          </div>
          <AddBillForm />
        </div>

        <BillsTable bills={bills} />
      </div>
    </BaseLayout>
  )
}
