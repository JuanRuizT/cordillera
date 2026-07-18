import { prisma } from "@/lib/db"
import { BaseLayout } from "@/components/base-layout"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AnalysisTabs } from "./analysis-tabs"
import { CategoryTable } from "./category-table"
import { TrendChart, CategoryBreakdownChart, RunningBalanceChart } from "./charts"
import type { AnalysisParams } from "./use-analysis-nav"
import {
  bucketByCategory,
  groupByMonth,
  groupByYear,
  formatCurrency,
  formatMonthLabel,
  formatMonthShort,
} from "@/lib/accounting/analysis"

export default async function AccountingAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; month?: string; year?: string }>
}) {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")

  // Child records (Egresos explaining a Retiro en Efectivo, or split payment pieces) share the
  // same money as their parent — only top-level records are counted, same as the table's Balance.
  const allRecords = await prisma.accountingRecord.findMany({
    where: { userId: user.id, parentRecordId: null },
    select: { date: true, income: true, expenses: true },
    orderBy: { date: "desc" },
  })

  const uniqueMonths = [...new Set(allRecords.map((r) => r.date.toISOString().slice(0, 7)))]
  const uniqueYears = [...new Set(allRecords.map((r) => r.date.toISOString().slice(0, 4)))]

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
  const view: "month" | "year" = params.view === "year" ? "year" : "month"
  const selectedMonth = uniqueMonths.includes(params.month ?? "") ? params.month! : uniqueMonths[0]
  const selectedYear = uniqueYears.includes(params.year ?? "") ? params.year! : uniqueYears[0]
  const current: AnalysisParams = { view, month: selectedMonth, year: selectedYear }

  // ---------- Month scope ----------
  const [y, m] = selectedMonth.split("-").map(Number)
  const monthStart = new Date(Date.UTC(y, m - 1, 1))
  const monthEnd = new Date(Date.UTC(y, m, 1))
  const monthParents = await prisma.accountingRecord.findMany({
    where: { userId: user.id, date: { gte: monthStart, lt: monthEnd }, parentRecordId: null },
    select: { id: true, category: true, income: true, expenses: true },
  })
  const monthChildren = await prisma.accountingRecord.findMany({
    where: { parentRecordId: { in: monthParents.map((p) => p.id) } },
    select: { parentRecordId: true, category: true, income: true, expenses: true },
  })
  const monthGrouped = bucketByCategory(monthParents, monthChildren)
  const monthIncome = monthGrouped.reduce((s, r) => s + r.income, 0)
  const monthExpenses = monthGrouped.reduce((s, r) => s + r.expenses, 0)
  const monthNet = monthIncome - monthExpenses
  const monthCategoryChartData = monthGrouped.map((r) => ({
    category: r.category ?? "Sin categoría",
    income: r.income,
    expenses: r.expenses,
  }))

  // ---------- Year scope ----------
  const yearNum = Number(selectedYear)
  const yearStart = new Date(Date.UTC(yearNum, 0, 1))
  const yearEnd = new Date(Date.UTC(yearNum + 1, 0, 1))
  const yearParents = await prisma.accountingRecord.findMany({
    where: { userId: user.id, date: { gte: yearStart, lt: yearEnd }, parentRecordId: null },
    select: { id: true, category: true, income: true, expenses: true },
  })
  const yearChildren = await prisma.accountingRecord.findMany({
    where: { parentRecordId: { in: yearParents.map((p) => p.id) } },
    select: { parentRecordId: true, category: true, income: true, expenses: true },
  })
  const yearGrouped = bucketByCategory(yearParents, yearChildren)
  const yearIncome = yearGrouped.reduce((s, r) => s + r.income, 0)
  const yearExpenses = yearGrouped.reduce((s, r) => s + r.expenses, 0)
  const yearNet = yearIncome - yearExpenses
  const yearCategoryChartData = yearGrouped.map((r) => ({
    category: r.category ?? "Sin categoría",
    income: r.income,
    expenses: r.expenses,
  }))
  const yearInProgress = yearNum === new Date().getFullYear()

  // ---------- Whole-history series (all derived from allRecords, no extra queries) ----------
  const monthlyMap = groupByMonth(allRecords)
  const monthlyTrendAll = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, v]) => ({ period, label: formatMonthShort(period), income: v.income, expenses: v.expenses }))

  let cumulativeBalance = 0
  const runningBalance = monthlyTrendAll.map((row) => {
    cumulativeBalance += row.income - row.expenses
    return { month: row.period, label: row.label, balance: cumulativeBalance }
  })

  const monthsInSelectedYear = monthlyTrendAll.filter((row) => row.period.startsWith(selectedYear))

  const yearlyMap = groupByYear(allRecords)
  const yearlyTrend = Array.from(yearlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, v]) => ({ period, label: period, income: v.income, expenses: v.expenses }))

  const monthLabel = formatMonthLabel(selectedMonth)
  const yearLabel = `${selectedYear}${yearInProgress ? " · en curso" : ""}`

  return (
    <BaseLayout wide>
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Análisis</h1>

        <AnalysisTabs
          current={current}
          months={uniqueMonths}
          years={uniqueYears}
          monthLabel={monthLabel}
          yearLabel={yearLabel}
          monthPanel={
            <>
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Ingresos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(monthIncome)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Egresos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-red-600">{formatCurrency(monthExpenses)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Neto</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className={`text-2xl font-bold ${monthNet >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(monthNet)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Categorías — {monthLabel}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CategoryBreakdownChart data={monthCategoryChartData} />
                </CardContent>
              </Card>

              <CategoryTable rows={monthGrouped} />
            </>
          }
          yearPanel={
            <>
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Ingresos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(yearIncome)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Egresos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-red-600">{formatCurrency(yearExpenses)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Neto</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className={`text-2xl font-bold ${yearNet >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(yearNet)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Ingresos y egresos por año</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TrendChart data={yearlyTrend} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Desglose mensual — {selectedYear}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TrendChart data={monthsInSelectedYear} />
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Categorías — {selectedYear}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CategoryBreakdownChart data={yearCategoryChartData} />
                </CardContent>
              </Card>

              <CategoryTable rows={yearGrouped} />
            </>
          }
        />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Balance acumulado</CardTitle>
          </CardHeader>
          <CardContent>
            <RunningBalanceChart data={runningBalance} />
          </CardContent>
        </Card>
      </div>
    </BaseLayout>
  )
}
