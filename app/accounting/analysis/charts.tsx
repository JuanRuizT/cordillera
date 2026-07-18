"use client"

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"

function formatCompact(value: number) {
  return Number(value).toLocaleString("es-CO")
}

const flowChartConfig = {
  income: { label: "Ingresos", color: "#16a34a" },
  expenses: { label: "Egresos", color: "#dc2626" },
} satisfies ChartConfig

export function MonthlyTrendChart({
  data,
}: {
  data: { month: string; label: string; income: number; expenses: number }[]
}) {
  return (
    <ChartContainer config={flowChartConfig} className="aspect-auto h-64 w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} width={70} tickFormatter={formatCompact} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="income" fill="var(--color-income)" radius={4} />
        <Bar dataKey="expenses" fill="var(--color-expenses)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}

export function CategoryBreakdownChart({
  data,
}: {
  data: { category: string; income: number; expenses: number }[]
}) {
  return (
    <ChartContainer config={flowChartConfig} className="aspect-auto h-64 w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={formatCompact} />
        <YAxis type="category" dataKey="category" tickLine={false} axisLine={false} width={140} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="income" fill="var(--color-income)" radius={4} />
        <Bar dataKey="expenses" fill="var(--color-expenses)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}

const balanceChartConfig = {
  balance: { label: "Balance acumulado", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig

export function RunningBalanceChart({
  data,
}: {
  data: { month: string; label: string; balance: number }[]
}) {
  return (
    <ChartContainer config={balanceChartConfig} className="aspect-auto h-64 w-full">
      <AreaChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} width={70} tickFormatter={formatCompact} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          dataKey="balance"
          type="monotone"
          fill="var(--color-balance)"
          fillOpacity={0.2}
          stroke="var(--color-balance)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  )
}
