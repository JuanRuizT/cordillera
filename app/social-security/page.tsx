import { BaseLayout } from "@/components/base-layout"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { currentMonthInColombia } from "@/lib/owner-fees"
import { AddSocialSecurityForm } from "./add-form"
import { SocialSecurityTable } from "./social-security-table"
import { listSocialSecurityPayments, getDefaultExpectedAmount } from "./actions"

export default async function SocialSecurityPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const [entries, defaultExpected] = await Promise.all([listSocialSecurityPayments(), getDefaultExpectedAmount()])

  return (
    <BaseLayout wide selfManagedScroll>
      <div className="flex flex-1 flex-col min-h-0 gap-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Seguridad Social</h1>
            <p className="text-sm text-muted-foreground">
              Planillas de aportes (PILA) y pagos vinculados de Contabilidad
            </p>
          </div>
          <AddSocialSecurityForm defaultExpected={defaultExpected} />
        </div>

        <SocialSecurityTable entries={entries} currentMonth={currentMonthInColombia()} />
      </div>
    </BaseLayout>
  )
}
