"use client"

import { useRouter } from "next/navigation"

export type AnalysisParams = { view: "month" | "year"; month: string; year: string }

// Takes the current params as an argument (already resolved server-side in page.tsx and passed
// down as props) rather than calling useSearchParams() itself — avoids requiring a Suspense
// boundary for a Client Component reading search params, which nothing else in this app uses yet.
// Every control that needs to navigate calls this with its own `current` prop and overrides just
// the key it owns, so the other two params are always preserved.
export function useAnalysisNav(current: AnalysisParams) {
  const router = useRouter()
  return (overrides: Partial<AnalysisParams>) => {
    const next = { ...current, ...overrides }
    const params = new URLSearchParams()
    params.set("view", next.view)
    params.set("month", next.month)
    params.set("year", next.year)
    router.push(`/accounting/analysis?${params.toString()}`)
  }
}
