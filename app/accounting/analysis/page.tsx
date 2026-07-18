import { prisma } from "@/lib/db"
import { BaseLayout } from "@/components/base-layout"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MonthSelector } from "./month-selector"
import { MonthlyTrendChart, CategoryBreakdownChart, RunningBalanceChart } from "./charts"

function formatCurrency(value: number) {
  return value.toLocaleString("es-CO", { minimumFractionDigits: 2 })
}

function formatMonthLabel(ym: string) {
  const label = new Date(ym + "-02").toLocaleDateString("es-CO", { month: "long", year: "numeric" })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function formatMonthShort(ym: string) {
  const label = new Date(ym + "-02").toLocaleDateString("es-CO", { month: "short", year: "2-digit" })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export default async function AccountingAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")

  const allRecords = await prisma.accountingRecord.findMany({
    where: { userId: user.id },
    select: { date: true, income: true, expenses: true },
    orderBy: { date: "desc" },
  })

  const uniqueMonths = [...new Set(allRecords.map((r) => r.date.toISOString().slice(0, 7)))]

  if (uniqueMonths.length === 0) {
    return (
      <BaseLayout wide>
        <div className="flex flex-col gap-6">
          <h1 className="text-2xl font-bold">Análisis</h1>
          <p className="text-muted-foreground">No hay registros aún.</p>
        </div>
      </BaseLayout>
    )
  }

  const params = await searchParams
  const selectedMonth = uniqueMonths.includes(params.month ?? "") ? params.month! : uniqueMonths[0]

  const [y, m] = selectedMonth.split("-").map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 1))

  const grouped = await prisma.accountingRecord.groupBy({
    by: ["category"],
    where: { userId: user.id, date: { gte: start, lt: end } },
    _sum: { income: true, expenses: true },
    _count: { id: true },
  })

  grouped.sort((a, b) => {
    if (a.category === null && b.category !== null) return 1
    if (a.category !== null && b.category === null) return -1
    return (a.category ?? "").localeCompare(b.category ?? "", "es-CO")
  })

  const totalIncome = grouped.reduce((s, r) => s + Number(r._sum.income ?? 0), 0)
  const totalExpenses = grouped.reduce((s, r) => s + Number(r._sum.expenses ?? 0), 0)
  const totalNet = totalIncome - totalExpenses

  const categoryChartData = grouped.map((row) => ({
    category: row.category ?? "Sin categoría",
    income: Number(row._sum.income ?? 0),
    expenses: Number(row._sum.expenses ?? 0),
  }))

  // Monthly income/expenses across the full history, in chronological order.
  const monthlyMap = new Map<string, { income: number; expenses: number }>()
  for (const r of allRecords) {
    const key = r.date.toISOString().slice(0, 7)
    const entry = monthlyMap.get(key) ?? { income: 0, expenses: 0 }
    entry.income += Number(r.income ?? 0)
    entry.expenses += Number(r.expenses ?? 0)
    monthlyMap.set(key, entry)
  }
  const monthlyTrend = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, label: formatMonthShort(month), income: v.income, expenses: v.expenses }))

  let cumulativeBalance = 0
  const runningBalance = monthlyTrend.map((row) => {
    cumulativeBalance += row.income - row.expenses
    return { month: row.month, label: row.label, balance: cumulativeBalance }
  })

  return (
    <BaseLayout wide>
      <div className="flex flex-1 flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Análisis</h1>
            <p className="text-sm text-muted-foreground">{formatMonthLabel(selectedMonth)}</p>
          </div>
          <MonthSelector months={uniqueMonths} current={selectedMonth} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Ingresos</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalIncome)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Egresos</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(totalExpenses)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Neto</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${totalNet >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(totalNet)}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tendencia mensual</CardTitle>
            </CardHeader>
            <CardContent>
              <MonthlyTrendChart data={monthlyTrend} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Balance acumulado</CardTitle>
            </CardHeader>
            <CardContent>
              <RunningBalanceChart data={runningBalance} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Categorías — {formatMonthLabel(selectedMonth)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBreakdownChart data={categoryChartData} />
          </CardContent>
        </Card>

        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Categoría</th>
                <th className="px-4 py-3 text-right font-medium">Transacciones</th>
                <th className="px-4 py-3 text-right font-medium">Ingresos</th>
                <th className="px-4 py-3 text-right font-medium">Egresos</th>
                <th className="px-4 py-3 text-right font-medium">Neto</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((row) => {
                const income = Number(row._sum.income ?? 0)
                const expenses = Number(row._sum.expenses ?? 0)
                const net = income - expenses
                return (
                  <tr key={row.category ?? "__null__"} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      {row.category ?? <span className="text-muted-foreground italic">Sin categoría</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {row._count.id}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-600">
                      {income > 0 ? formatCurrency(income) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-600">
                      {expenses > 0 ? formatCurrency(expenses) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-medium ${net >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(net)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted font-semibold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {grouped.reduce((s, r) => s + r._count.id, 0)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-green-600">{formatCurrency(totalIncome)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-red-600">{formatCurrency(totalExpenses)}</td>
                <td className={`px-4 py-3 text-right tabular-nums ${totalNet >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(totalNet)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </BaseLayout>
  )
}
