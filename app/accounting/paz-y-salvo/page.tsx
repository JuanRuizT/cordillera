import { prisma } from "@/lib/db"
import { BaseLayout } from "@/components/base-layout"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { PazYSalvoTable } from "./table"

// "Pago Administración" es la cuota mensual obligatoria — es la única que se compara contra
// Owner.monthlyFee para el estado de paz y salvo. "Cuota extraordinaria" es un pago aparte,
// definido puntualmente entre los copropietarios para imprevistos/gastos adicionales — no tiene
// un monto mensual esperado, así que solo se muestra como total informativo, sin juzgar mora.
const ADMIN_FEE_CATEGORY = "Pago Administración"
const EXTRAORDINARY_CATEGORY = "Cuota extraordinaria"

function formatMonthShort(ym: string) {
  const label = new Date(ym + "-02").toLocaleDateString("es-CO", { month: "short", year: "2-digit" })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function monthRange(startYm: string, endYm: string): string[] {
  const [sy, sm] = startYm.split("-").map(Number)
  const [ey, em] = endYm.split("-").map(Number)
  const months: string[] = []
  let y = sy
  let m = sm
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return months
}

export default async function PazYSalvoPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")

  const [owners, adminFeeRecords, extraordinaryRecords, earliestRecord] = await Promise.all([
    prisma.owner.findMany({ select: { unit: true, name: true, monthlyFee: true }, orderBy: { unit: "asc" } }),
    prisma.accountingRecord.findMany({
      where: { userId: user.id, property: { not: null }, category: ADMIN_FEE_CATEGORY },
      select: { property: true, date: true, income: true },
    }),
    prisma.accountingRecord.findMany({
      where: { userId: user.id, property: { not: null }, category: EXTRAORDINARY_CATEGORY },
      select: { property: true, income: true },
    }),
    prisma.accountingRecord.findFirst({ where: { userId: user.id }, orderBy: { date: "asc" }, select: { date: true } }),
  ])

  if (!earliestRecord) {
    return (
      <BaseLayout wide>
        <div className="flex flex-col gap-6">
          <h1 className="text-2xl font-bold">Paz y Salvo</h1>
          <p className="text-muted-foreground">No hay registros contables aún.</p>
        </div>
      </BaseLayout>
    )
  }

  const currentMonth = new Date().toISOString().slice(0, 7)
  const startMonth = earliestRecord.date.toISOString().slice(0, 7)
  const months = monthRange(startMonth, currentMonth)

  const paidByOwnerMonth = new Map<string, Map<string, number>>()
  for (const r of adminFeeRecords) {
    const unit = r.property as string
    const month = r.date.toISOString().slice(0, 7)
    const ownerMap = paidByOwnerMonth.get(unit) ?? new Map<string, number>()
    ownerMap.set(month, (ownerMap.get(month) ?? 0) + Number(r.income ?? 0))
    paidByOwnerMonth.set(unit, ownerMap)
  }

  const extraordinaryByOwner = new Map<string, number>()
  for (const r of extraordinaryRecords) {
    const unit = r.property as string
    extraordinaryByOwner.set(unit, (extraordinaryByOwner.get(unit) ?? 0) + Number(r.income ?? 0))
  }

  const rows = owners.map((o) => {
    const paidByMonth = paidByOwnerMonth.get(o.unit) ?? new Map<string, number>()
    const monthsData = months.map((month) => ({ month, paid: paidByMonth.get(month) ?? 0 }))
    const paidTotal = monthsData.reduce((s, m) => s + m.paid, 0)
    const monthlyFee = o.monthlyFee != null ? Number(o.monthlyFee) : null
    const expectedTotal = monthlyFee != null ? monthlyFee * months.length : null
    const balance = expectedTotal != null ? expectedTotal - paidTotal : null
    return {
      unit: o.unit,
      name: o.name,
      monthlyFee,
      months: monthsData,
      paidTotal,
      expectedTotal,
      balance,
      extraordinaryTotal: extraordinaryByOwner.get(o.unit) ?? 0,
    }
  })

  return (
    <BaseLayout wide>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">Paz y Salvo</h1>
          <p className="text-sm text-muted-foreground">
            Corte al {formatMonthShort(currentMonth)} — cuentas desde {formatMonthShort(startMonth)}
          </p>
        </div>

        <PazYSalvoTable rows={rows} monthLabels={months.map((m) => ({ month: m, label: formatMonthShort(m) }))} />
      </div>
    </BaseLayout>
  )
}
