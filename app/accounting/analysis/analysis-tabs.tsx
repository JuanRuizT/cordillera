"use client"

import { CalendarDays, CalendarRange } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MonthSelector } from "./month-selector"
import { YearSelector } from "./year-selector"
import { useAnalysisNav, type AnalysisParams } from "./use-analysis-nav"

export function AnalysisTabs({
  current,
  months,
  years,
  monthLabel,
  yearLabel,
  monthPanel,
  yearPanel,
}: {
  current: AnalysisParams
  months: string[]
  years: string[]
  monthLabel: string
  yearLabel: string
  monthPanel: React.ReactNode
  yearPanel: React.ReactNode
}) {
  const navigate = useAnalysisNav(current)

  return (
    <Tabs
      value={current.view}
      onValueChange={(v) => navigate({ view: v as "month" | "year" })}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="month" className="gap-1.5">
            <CalendarDays className="h-4 w-4" />
            Mensual
          </TabsTrigger>
          <TabsTrigger value="year" className="gap-1.5">
            <CalendarRange className="h-4 w-4" />
            Anual
          </TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">{current.view === "month" ? monthLabel : yearLabel}</p>
          {current.view === "month" ? (
            <MonthSelector months={months} current={current} />
          ) : (
            <YearSelector years={years} current={current} />
          )}
        </div>
      </div>

      <TabsContent value="month" className="flex flex-col gap-6 mt-0">
        {monthPanel}
      </TabsContent>
      <TabsContent value="year" className="flex flex-col gap-6 mt-0">
        {yearPanel}
      </TabsContent>
    </Tabs>
  )
}
