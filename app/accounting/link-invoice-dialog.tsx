"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { linkEgreso, unlinkEgreso } from "../invoices/actions"
import type { OpenInvoiceOption } from "../invoices/actions"

type LinkRecord = {
  id: string
  concept: string
  invoiceId: string | null
  invoiceLabel: string | null
  expenses: string | null
  income: string | null
}

function money(v: string | number) {
  return "$" + Number(v).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

interface Props {
  record: LinkRecord | null
  openInvoices: OpenInvoiceOption[]
  open: boolean
  onClose: () => void
}

export function LinkInvoiceDialog({ record, openInvoices, open, onClose }: Props) {
  const [selected, setSelected] = useState("")
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (open && record) setSelected(record.invoiceId ?? "")
  }, [open, record])

  if (!record) return null

  const amount = Number(record.expenses ?? record.income ?? 0)
  const selectedInvoice = openInvoices.find((i) => i.id === selected)

  const save = () => {
    startTransition(async () => {
      if (selected) await linkEgreso(record.id, selected)
      else await unlinkEgreso(record.id)
      toast.success(selected ? "Egreso ligado a la cuenta de cobro." : "Egreso desligado de la cuenta de cobro.")
      onClose()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md p-6">
        <div className="flex flex-col gap-1">
          <DialogTitle>Cuenta de cobro del egreso</DialogTitle>
          <DialogDescription className="truncate">{record.concept} — {money(amount)}</DialogDescription>
        </div>

        <div className="flex flex-col gap-1.5 py-3">
          <label className="text-sm font-medium">Abona a la cuenta de cobro</label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">— Ninguna (egreso suelto) —</option>
            {record.invoiceId && !openInvoices.some((i) => i.id === record.invoiceId) && (
              <option value={record.invoiceId}>{record.invoiceLabel ?? "Cuenta de cobro actual"}</option>
            )}
            {openInvoices.map((i) => (
              <option key={i.id} value={i.id}>
                {i.contractorName} — {i.concept} (pend. {money(i.pending)})
              </option>
            ))}
          </select>
          {selectedInvoice && amount > Number(selectedInvoice.pending) && (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              El abono ({money(amount)}) supera el pendiente ({money(selectedInvoice.pending)}).
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
