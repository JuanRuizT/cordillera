"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus } from "lucide-react"
import { createWithdrawalBreakdownRecord, createPaymentSplitRecord } from "./actions"

interface AddChildRecordRowProps {
  parentId: string
  // Retiro en Efectivo or a plain Egreso → child is an Egreso (expenses); Pago Administración/
  // Cuota extraordinaria → child is a split payment (income).
  isExpenseBreakdown: boolean
  defaultDate: string
  colSpan: number
}

// Sits at the end of a parent's nested child rows — lets the user record what a withdrawal/Egreso
// was spent on, or split a payment into several receipt-worthy pieces, without leaving the table.
export function AddChildRecordRow({ parentId, isExpenseBreakdown, defaultDate, colSpan }: AddChildRecordRowProps) {
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [concept, setConcept] = useState("")
  const [date, setDate] = useState("")
  const [amount, setAmount] = useState("")

  function openForm() {
    setConcept("")
    setDate(defaultDate.slice(0, 10))
    setAmount("")
    setShowForm(true)
  }

  function save() {
    startTransition(async () => {
      const res = isExpenseBreakdown
        ? await createWithdrawalBreakdownRecord(parentId, { concept, date, expenses: amount })
        : await createPaymentSplitRecord(parentId, { concept, date, income: amount })
      if (res.error) {
        toast.error(res.error)
        return
      }
      setShowForm(false)
      toast.success(isExpenseBreakdown ? "Egreso agregado." : "Pago agregado.")
    })
  }

  return (
    <tr className="border-b-2 border-b-slate-400 bg-slate-50 dark:border-b-slate-500 dark:bg-slate-800/30">
      <td colSpan={colSpan} className="border-l-4 border-l-slate-400 px-4 py-2 pl-14 dark:border-l-slate-500">
        {showForm ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              autoFocus
              placeholder="Concepto"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              className="h-7 w-48 text-sm"
            />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-7 w-36 text-sm" />
            <Input
              type="number"
              placeholder="Monto"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-7 w-32 text-sm"
            />
            <Button size="sm" className="h-7 px-2 text-xs" onClick={save} disabled={isPending}>
              {isPending ? "Guardando…" : "Guardar"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setShowForm(false)} disabled={isPending}>
              Cancelar
            </Button>
          </div>
        ) : (
          <button onClick={openForm} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <Plus className="h-3.5 w-3.5" /> {isExpenseBreakdown ? "Agregar egreso" : "Agregar Ingreso"}
          </button>
        )}
      </td>
    </tr>
  )
}
