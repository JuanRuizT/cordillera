"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { markBillPaidInBill, clearBillPaidInBill } from "./actions"
import type { BillData } from "@/lib/bills/document-data"

function money(v: string | number) {
  return "$" + Number(v).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })
}

interface Props {
  bill: BillData | null
  bills: BillData[]
  open: boolean
  onClose: () => void
}

// "Pagada en otra factura": picks the later bill whose payment covered this one. Always mounted and
// driven by `open`, like the other dialogs — never mounted on demand.
export function PaidInBillDialog({ bill, bills, open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md p-6">
        {/* Keyed by bill so the selection starts from that bill's current value every time. */}
        {bill && <PaidInBillForm key={bill.id} bill={bill} bills={bills} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function PaidInBillForm({ bill, bills, onClose }: { bill: BillData; bills: BillData[]; onClose: () => void }) {
  const [selected, setSelected] = useState(bill.paidInBill?.id ?? "")
  const [pending, startTransition] = useTransition()
  // Same rules markBillPaidInBill enforces: a later bill that wasn't itself carried into another.
  const options = bills
    .filter((b) => b.id !== bill.id && b.date > bill.date && !b.paidInBill)
    .sort((a, b) => a.date.localeCompare(b.date))

  const save = () => {
    startTransition(async () => {
      const res = selected ? await markBillPaidInBill(bill.id, selected) : await clearBillPaidInBill(bill.id)
      if (res.error) { toast.error(res.error); return }
      toast.success(selected ? "Factura marcada como pagada en otra factura." : "La factura vuelve a quedar pendiente.")
      onClose()
    })
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <DialogTitle>Pagada en otra factura</DialogTitle>
        <DialogDescription>
          {bill.concept} — {money(bill.amount)}. Elegí la factura posterior que incluyó este saldo y se pagó: esta queda
          pagada con la fecha de ese pago, sin necesitar un registro propio en Contabilidad.
        </DialogDescription>
      </div>

      <div className="flex flex-col gap-1.5 py-3">
        <label htmlFor="paid-in-bill" className="text-sm font-medium">Se pagó dentro de</label>
        <select
          id="paid-in-bill"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">— Ninguna (pendiente) —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.concept} · {formatDate(o.date)} · {money(o.amount)}{o.status === "pagada" ? "" : " (sin pago todavía)"}
            </option>
          ))}
        </select>
        {options.length === 0 && (
          <p className="text-xs text-muted-foreground">No hay facturas posteriores a esta.</p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={save} disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
      </div>
    </>
  )
}
