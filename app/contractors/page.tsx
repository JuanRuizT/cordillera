import { BaseLayout } from "@/components/base-layout"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { AddContractorForm } from "./add-contractor-form"
import { ContractorsTable } from "./contractors-table"
import { listContractors } from "./actions"

export default async function ContractorsPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const contractors = await listContractors()

  return (
    <BaseLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Contratistas</h1>
            <p className="text-sm text-muted-foreground">
              {contractors.length} {contractors.length === 1 ? "contratista" : "contratistas"}
            </p>
          </div>
          <AddContractorForm />
        </div>

        <ContractorsTable contractors={contractors} />
      </div>
    </BaseLayout>
  )
}
