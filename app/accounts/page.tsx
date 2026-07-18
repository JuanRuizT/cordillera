import { BaseLayout } from "@/components/base-layout"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { AddAccountForm } from "./add-account-form"
import { AccountsTable } from "./accounts-table"
import { listFinancialAccounts } from "./actions"

export default async function AccountsPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const accounts = await listFinancialAccounts()

  return (
    <BaseLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Cuentas Bancarias</h1>
            <p className="text-sm text-muted-foreground">
              {accounts.length} {accounts.length === 1 ? "cuenta" : "cuentas"}
            </p>
          </div>
          <AddAccountForm />
        </div>

        <AccountsTable accounts={accounts} />
      </div>
    </BaseLayout>
  )
}
