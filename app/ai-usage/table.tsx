"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import type { AiCallLogData } from "./actions"
import { formatUsdCost } from "@/lib/currency"

const FEATURE_LABELS: Record<string, string> = {
  bank_statement_classification: "Clasificación de extractos",
  invoice_extraction: "Extracción de cuentas de cobro",
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function statusBadge(success: boolean) {
  return success ? (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
      Éxito
    </span>
  ) : (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
      Error
    </span>
  )
}

type SortField = "createdAt" | "estimatedCostUsd" | "totalTokens"

interface Props {
  logs: AiCallLogData[]
}

export function AiUsageTable({ logs }: Props) {
  const [sortField, setSortField] = useState<SortField>("createdAt")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortField(field)
      setSortDir("desc")
    }
  }

  const sorted = useMemo(() => {
    const sign = sortDir === "asc" ? 1 : -1
    return [...logs].sort((a, b) => {
      const cmp =
        sortField === "createdAt"
          ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          : sortField === "estimatedCostUsd"
            ? Number(a.estimatedCostUsd ?? 0) - Number(b.estimatedCostUsd ?? 0)
            : (a.totalTokens ?? 0) - (b.totalTokens ?? 0)
      return cmp * sign
    })
  }, [logs, sortField, sortDir])

  function sortIcon(field: SortField) {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
    return sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
  }

  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay llamados de IA registrados.</p>
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="p-2">
              <button className="flex items-center gap-1 font-medium" onClick={() => toggleSort("createdAt")}>
                Fecha {sortIcon("createdAt")}
              </button>
            </th>
            <th className="p-2 font-medium">Función</th>
            <th className="p-2 font-medium">Modelo</th>
            <th className="p-2 text-right font-medium">Items</th>
            <th className="p-2 text-right font-medium">Tokens entrada</th>
            <th className="p-2 text-right font-medium">Tokens salida</th>
            <th className="p-2 text-right">
              <button className="ml-auto flex items-center gap-1 font-medium" onClick={() => toggleSort("totalTokens")}>
                Tokens totales {sortIcon("totalTokens")}
              </button>
            </th>
            <th className="p-2 text-right">
              <button className="ml-auto flex items-center gap-1 font-medium" onClick={() => toggleSort("estimatedCostUsd")}>
                Costo estimado {sortIcon("estimatedCostUsd")}
              </button>
            </th>
            <th className="p-2 text-right font-medium">Duración</th>
            <th className="p-2 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((log) => (
            <tr key={log.id} className="border-t" title={log.errorMessage ?? undefined}>
              <td className="whitespace-nowrap p-2">{formatDateTime(log.createdAt)}</td>
              <td className="p-2">{FEATURE_LABELS[log.feature] ?? log.feature}</td>
              <td className="whitespace-nowrap p-2">{log.model}</td>
              <td className="p-2 text-right">{log.itemCount ?? "—"}</td>
              <td className="p-2 text-right">{log.inputTokens?.toLocaleString("es-CO") ?? "—"}</td>
              <td className="p-2 text-right">{log.outputTokens?.toLocaleString("es-CO") ?? "—"}</td>
              <td className="p-2 text-right">{log.totalTokens?.toLocaleString("es-CO") ?? "—"}</td>
              <td className="p-2 text-right">{formatUsdCost(log.estimatedCostUsd)}</td>
              <td className="p-2 text-right">{log.durationMs != null ? `${log.durationMs} ms` : "—"}</td>
              <td className="p-2">{statusBadge(log.success)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
