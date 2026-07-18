"use client"

import { formatMonthLabel } from "@/lib/accounting/analysis"
import { useAnalysisNav, type AnalysisParams } from "./use-analysis-nav"

export function MonthSelector({ months, current }: { months: string[]; current: AnalysisParams }) {
  const navigate = useAnalysisNav(current)
  const orderedMonths = [...months].reverse()
  return (
    <select
      value={current.month}
      onChange={(e) => navigate({ month: e.target.value })}
      className="text-sm border rounded-md px-2 py-1.5 bg-background text-foreground"
    >
      {orderedMonths.map((m) => (
        <option key={m} value={m}>{formatMonthLabel(m)}</option>
      ))}
    </select>
  )
}
