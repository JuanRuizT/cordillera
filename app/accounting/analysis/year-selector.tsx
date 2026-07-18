"use client"

import { useAnalysisNav, type AnalysisParams } from "./use-analysis-nav"

export function YearSelector({ years, current }: { years: string[]; current: AnalysisParams }) {
  const navigate = useAnalysisNav(current)
  const orderedYears = [...years].reverse()
  return (
    <select
      value={current.year}
      onChange={(e) => navigate({ year: e.target.value })}
      className="text-sm border rounded-md px-2 py-1.5 bg-background text-foreground"
    >
      {orderedYears.map((y) => (
        <option key={y} value={y}>{y}</option>
      ))}
    </select>
  )
}
