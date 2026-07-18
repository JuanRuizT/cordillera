"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { linkBillPayment, unlinkBillPayment } from "../bills/actions"
import type { BillLinkOption } from "../bills/actions"

type LinkRecord = {
  id: string
  concept: string
  billId: string | null
  billConcept: string | null
  expenses: string | null
  income: string | null
}

function money(v: string | number) {
  return "$" + Number(v).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

interface Props {
  record: LinkRecord | null
  bills: BillLinkOption[]
  open: boolean
  onClose: () => void
}

export function LinkBillDialog({ record, bills, open, onClose }: Props) {
  const [selected, setSelected] = useState("")
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (open && record) setSelected(record.billId ?? "")
  }, [open, record])

  if (!record) return null

  const amount = Number(record.expenses ?? record.income ?? 0)

  const save = () => {
    startTransition(async () => {
      if (selected) await linkBillPayment(record.id, selected)
      else await unlinkBillPayment(record.id)
      toast.success(selected ? "Registro ligado a la factura." : "Registro desligado de la factura.")
      onClose()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md p-6">
        <div className="flex flex-col gap-1">
          <DialogTitle>Factura del registro</DialogTitle>
          <DialogDescription className="truncate">{record.concept} — {money(amount)}</DialogDescription>
        </div>

        <div className="flex flex-col gap-1.5 py-3">
          <label className="text-sm font-medium">Corresponde al pago de la factura</label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">— Ninguna —</option>
            {record.billId && !bills.some((b) => b.id === record.billId) && (
              <option value={record.billId}>{record.billConcept ?? "Factura actual"}</option>
            )}
            {bills.map((b) => (
              <option key={b.id} value={b.id}>
                {b.concept} (pend. {money(b.amount)})
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
