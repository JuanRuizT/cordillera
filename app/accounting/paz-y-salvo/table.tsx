"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { updateOwnerMonthlyFee } from "./actions"

function money(v: number) {
  return "$" + v.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function statusBadge(balance: number | null) {
  if (balance == null) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
        Cuota no configurada
      </span>
    )
  }
  if (balance <= 0) {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
        A paz y salvo
      </span>
    )
  }
  return (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
      En mora — {money(balance)}
    </span>
  )
}

export type PazYSalvoRow = {
  unit: string
  name: string
  monthlyFee: number | null
  months: { month: string; paid: number }[]
  paidTotal: number
  expectedTotal: number | null
  balance: number | null
  extraordinaryTotal: number
}

interface Props {
  rows: PazYSalvoRow[]
  monthLabels: { month: string; label: string }[]
}

export function PazYSalvoTable({ rows, monthLabels }: Props) {
  const [, startTransition] = useTransition()
  const [editingUnit, setEditingUnit] = useState<string | null>(null)
  const [draft, setDraft] = useState("")

  const startEdit = (row: PazYSalvoRow) => {
    setEditingUnit(row.unit)
    setDraft(row.monthlyFee != null ? String(row.monthlyFee) : "")
  }

  const commit = (unit: string) => {
    const value = draft
    setEditingUnit(null)
    startTransition(async () => {
      const result = await updateOwnerMonthlyFee(unit, value)
      if (result.error) toast.error(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-left">
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Unidad</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Propietario</th>
              <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Cuota mensual</th>
              <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Total esperado</th>
              <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Pagado Administración</th>
              <th
                className="px-4 py-3 text-right font-semibold whitespace-nowrap"
                title="Pagos aparte, definidos entre copropietarios para imprevistos — no cuentan para el estado de paz y salvo"
              >
                Cuotas Extraordinarias
              </th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.unit} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                <td className="px-4 py-2 whitespace-nowrap">{row.unit}</td>
                <td className="px-4 py-2 whitespace-nowrap">{row.name}</td>
                <td
                  className="px-4 py-2 text-right whitespace-nowrap"
                  onClick={() => { if (editingUnit !== row.unit) startEdit(row) }}
                >
                  {editingUnit === row.unit ? (
                    <input
                      autoFocus
                      type="number"
                      min="0"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => commit(row.unit)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commit(row.unit)
                        if (e.key === "Escape") setEditingUnit(null)
                      }}
                      className="h-8 w-28 rounded border border-input bg-background px-2 text-right text-sm"
                    />
                  ) : (
                    <span className="cursor-text">
                      {row.monthlyFee != null ? money(row.monthlyFee) : <span className="text-muted-foreground">Sin definir</span>}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                  {row.expectedTotal != null ? money(row.expectedTotal) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-green-600 whitespace-nowrap">
                  {money(row.paidTotal)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                  {row.extraordinaryTotal > 0 ? money(row.extraordinaryTotal) : "—"}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">{statusBadge(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Detalle mes a mes</h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="sticky left-0 bg-muted/50 px-4 py-3 font-semibold whitespace-nowrap">Unidad</th>
                {monthLabels.map((m) => (
                  <th key={m.month} className="px-3 py-3 text-right font-semibold whitespace-nowrap">{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.unit} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                  <td className="sticky left-0 bg-inherit px-4 py-2 font-medium whitespace-nowrap">{row.unit}</td>
                  {row.months.map((m) => (
                    <td key={m.month} className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                      {m.paid > 0 ? (
                        <span className="text-green-600">{money(m.paid)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
