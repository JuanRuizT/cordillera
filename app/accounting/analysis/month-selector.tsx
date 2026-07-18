"use client"

import { useRouter } from "next/navigation"

function formatMonthLabel(ym: string) {
  const label = new Date(ym + "-02").toLocaleDateString("es-CO", { month: "long", year: "numeric" })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function MonthSelector({ months, current }: { months: string[]; current: string }) {
  const router = useRouter()
  const orderedMonths = [...months].reverse()
  return (
    <select
      value={current}
      onChange={(e) => router.push(`/accounting/analysis?month=${e.target.value}`)}
      className="text-sm border rounded-md px-2 py-1.5 bg-background text-foreground"
    >
      {orderedMonths.map((m) => (
        <option key={m} value={m}>{formatMonthLabel(m)}</option>
      ))}
    </select>
  )
}
