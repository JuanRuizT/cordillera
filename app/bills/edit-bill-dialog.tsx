"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateBill } from "./actions"
import type { BillData } from "@/lib/bills/document-data"

interface Props {
  bill: BillData | null
  open: boolean
  onClose: () => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium leading-none">{label}</label>
      {children}
    </div>
  )
}

export function EditBillDialog({ bill, open, onClose }: Props) {
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [concept, setConcept] = useState("")
  const [amount, setAmount] = useState("")
  const [notes, setNotes] = useState("")

  useEffect(() => {
    if (!bill) return
    setDate(bill.date.slice(0, 10))
    setDueDate(bill.dueDate?.slice(0, 10) ?? "")
    setConcept(bill.concept)
    setAmount(bill.amount)
    setNotes(bill.notes ?? "")
  }, [bill])

  if (!bill) return null

  const handleSave = () => {
    if (!concept.trim()) { toast.error("El concepto no puede estar vacío."); return }
    if (!date) { toast.error("La fecha es requerida."); return }
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) { toast.error("El monto debe ser mayor a 0."); return }

    startTransition(async () => {
      const payload: Parameters<typeof updateBill>[1] = {}
      if (date !== bill.date.slice(0, 10)) payload.date = date
      if ((dueDate || null) !== (bill.dueDate?.slice(0, 10) ?? null)) payload.dueDate = dueDate || null
      if (concept.trim() !== bill.concept) payload.concept = concept.trim()
      if (parsedAmount !== parseFloat(bill.amount)) payload.amount = parsedAmount
      if ((notes.trim() || null) !== bill.notes) payload.notes = notes.trim() || null

      if (Object.keys(payload).length === 0) { onClose(); return }

      const res = await updateBill(bill.id, payload)
      if (res.error) toast.error(res.error)
      else { toast.success("Factura actualizada."); onClose() }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg p-6">
        <DialogTitle>Editar factura</DialogTitle>

        <div className="mt-4 flex flex-col gap-4">
          <Field label="Concepto">
            <Input value={concept} onChange={(e) => setConcept(e.target.value)} />
          </Field>

          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>

          <Field label="Fecha máxima de pago">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>

          <Field label="Monto">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>

          <Field label="Notas">
            <Input
              placeholder="Notas (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
