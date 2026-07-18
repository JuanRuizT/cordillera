"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus } from "lucide-react"
import { createWithdrawalBreakdownRecord, createPaymentSplitRecord, createWithdrawalMovementRecord } from "./actions"
import type { FinancialAccountData } from "../accounts/actions"

type ChildMode = "expense" | "income-split" | "movement"

interface AddChildRecordRowProps {
  parentId: string
  // Retiro en Efectivo → always a Movimiento (cash relocated to a different caja, never an
  // Egreso — see createWithdrawalBreakdownRecord's own server-side guard for the same rule).
  // Egreso/Retención en la fuente → an Egreso explaining what the money went to. Pago
  // Administración/Cuota extraordinaria → a split payment (income).
  mode: ChildMode
  accounts?: FinancialAccountData[]
  excludeAccountId?: string | null
  defaultDate: string
  colSpan: number
}

const MODE_LABEL: Record<ChildMode, string> = {
  expense: "Agregar egreso",
  "income-split": "Agregar Ingreso",
  movement: "Agregar movimiento a otra caja",
}

// A Movimiento's concept is always the same thing — asking the user to type it every time would
// be pure busywork, so it's fixed instead of shown as an input.
const MOVEMENT_CONCEPT = "Movimiento a caja"

// Sits at the end of a parent's nested child rows — lets the user record what a withdrawal/Egreso
// was spent on, or split a payment into several receipt-worthy pieces, without leaving the table.
export function AddChildRecordRow({ parentId, mode, accounts = [], excludeAccountId, defaultDate, colSpan }: AddChildRecordRowProps) {
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [concept, setConcept] = useState("")
  const [date, setDate] = useState("")
  const [amount, setAmount] = useState("")
  const [destAccountId, setDestAccountId] = useState("")

  const destAccountOptions = accounts.filter((a) => a.id !== excludeAccountId)

  function openForm() {
    setConcept(mode === "movement" ? MOVEMENT_CONCEPT : "")
    setDate(defaultDate.slice(0, 10))
    setAmount("")
    setDestAccountId("")
    setShowForm(true)
  }

  function save() {
    startTransition(async () => {
      const res =
        mode === "movement"
          ? await createWithdrawalMovementRecord(parentId, { concept: MOVEMENT_CONCEPT, date, income: amount, accountId: destAccountId })
          : mode === "expense"
            ? await createWithdrawalBreakdownRecord(parentId, { concept, date, expenses: amount })
            : await createPaymentSplitRecord(parentId, { concept, date, income: amount })
      if (res.error) {
        toast.error(res.error)
        return
      }
      setShowForm(false)
      toast.success(mode === "movement" ? "Movimiento agregado." : mode === "expense" ? "Egreso agregado." : "Pago agregado.")
    })
  }

  return (
    <tr className="border-b-2 border-b-slate-400 bg-slate-50 dark:border-b-slate-500 dark:bg-slate-800/30">
      <td colSpan={colSpan} className="border-l-4 border-l-slate-400 px-4 py-2 pl-14 dark:border-l-slate-500">
        {showForm ? (
          <div className="flex flex-wrap items-center gap-2">
            {mode !== "movement" && (
              <Input
                autoFocus
                placeholder="Concepto"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                className="h-7 w-48 text-sm"
              />
            )}
            <Input
              autoFocus={mode === "movement"}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-7 w-36 text-sm"
            />
            <Input
              type="number"
              placeholder="Monto"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-7 w-32 text-sm"
            />
            {mode === "movement" && (
              <select
                value={destAccountId}
                onChange={(e) => setDestAccountId(e.target.value)}
                className="h-7 rounded border border-input bg-background px-1 text-sm"
              >
                <option value="">— Caja destino —</option>
                {destAccountOptions.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}
            <Button size="sm" className="h-7 px-2 text-xs" onClick={save} disabled={isPending || (mode === "movement" && !destAccountId)}>
              {isPending ? "Guardando…" : "Guardar"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setShowForm(false)} disabled={isPending}>
              Cancelar
            </Button>
          </div>
        ) : (
          <button onClick={openForm} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <Plus className="h-3.5 w-3.5" />
            {MODE_LABEL[mode]}
          </button>
        )}
      </td>
    </tr>
  )
}
