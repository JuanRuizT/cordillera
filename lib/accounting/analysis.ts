import type { AccountingRecord } from "@/generated/prisma/client"

export function formatCurrency(value: number): string {
  return value.toLocaleString("es-CO", { minimumFractionDigits: 2 })
}

export function formatMonthLabel(ym: string): string {
  const label = new Date(ym + "-02").toLocaleDateString("es-CO", { month: "long", year: "numeric" })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function formatMonthShort(ym: string): string {
  const label = new Date(ym + "-02").toLocaleDateString("es-CO", { month: "short", year: "2-digit" })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export type CategoryRow = { category: string | null; income: number; expenses: number; count: number }

type CategoryParentInput = Pick<AccountingRecord, "id" | "category" | "income" | "expenses">
type CategoryChildInput = Pick<AccountingRecord, "parentRecordId" | "category" | "income" | "expenses">

// For a parent with children (Retiro en Efectivo → Egresos, or a split payment), attributes the
// money to the children's own categories instead of the parent's generic one. Whatever a parent's
// children haven't explained yet stays under the parent's own category, so totals always match
// the real cash movement regardless of how fully broken down it is.
export function bucketByCategory(parents: CategoryParentInput[], children: CategoryChildInput[]): CategoryRow[] {
  const childrenByParentId = new Map<string, CategoryChildInput[]>()
  for (const c of children) {
    const list = childrenByParentId.get(c.parentRecordId!) ?? []
    list.push(c)
    childrenByParentId.set(c.parentRecordId!, list)
  }

  type CategoryBucket = { income: number; expenses: number; count: number }
  const buckets = new Map<string | null, CategoryBucket>()
  function addToBucket(category: string | null, income: number, expenses: number) {
    const b = buckets.get(category) ?? { income: 0, expenses: 0, count: 0 }
    b.income += income
    b.expenses += expenses
    b.count += 1
    buckets.set(category, b)
  }

  for (const p of parents) {
    const kids = childrenByParentId.get(p.id) ?? []
    if (kids.length === 0) {
      addToBucket(p.category, Number(p.income ?? 0), Number(p.expenses ?? 0))
      continue
    }
    let childIncomeSum = 0
    let childExpensesSum = 0
    for (const c of kids) {
      const ci = Number(c.income ?? 0)
      const ce = Number(c.expenses ?? 0)
      childIncomeSum += ci
      childExpensesSum += ce
      addToBucket(c.category, ci, ce)
    }
    const pendingIncome = Number(p.income ?? 0) - childIncomeSum
    const pendingExpenses = Number(p.expenses ?? 0) - childExpensesSum
    if (pendingIncome > 0.005 || pendingExpenses > 0.005) {
      addToBucket(p.category, Math.max(pendingIncome, 0), Math.max(pendingExpenses, 0))
    }
  }

  const rows: CategoryRow[] = Array.from(buckets.entries()).map(([category, b]) => ({
    category,
    income: b.income,
    expenses: b.expenses,
    count: b.count,
  }))

  rows.sort((a, b) => {
    if (a.category === null && b.category !== null) return 1
    if (a.category !== null && b.category === null) return -1
    return (a.category ?? "").localeCompare(b.category ?? "", "es-CO")
  })

  return rows
}

type FlowRecordInput = Pick<AccountingRecord, "date" | "income" | "expenses">
type FlowTotals = { income: number; expenses: number }

export function groupByMonth(records: FlowRecordInput[]): Map<string, FlowTotals> {
  const map = new Map<string, FlowTotals>()
  for (const r of records) {
    const key = r.date.toISOString().slice(0, 7)
    const entry = map.get(key) ?? { income: 0, expenses: 0 }
    entry.income += Number(r.income ?? 0)
    entry.expenses += Number(r.expenses ?? 0)
    map.set(key, entry)
  }
  return map
}

export function groupByYear(records: FlowRecordInput[]): Map<string, FlowTotals> {
  const map = new Map<string, FlowTotals>()
  for (const r of records) {
    const key = r.date.toISOString().slice(0, 4)
    const entry = map.get(key) ?? { income: 0, expenses: 0 }
    entry.income += Number(r.income ?? 0)
    entry.expenses += Number(r.expenses ?? 0)
    map.set(key, entry)
  }
  return map
}
