"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateInvoice, updateInvoiceNumber, type InvoiceData } from "./actions"
import type { ContractorData } from "../contractors/actions"

// Por ley, la retención en la fuente solo puede ser 4% o 6%.
// Kept in sync with VALID_RETENTION_RATES in actions.ts.
const RETENTION_RATE_OPTIONS = [4, 6]

interface Props {
  invoice: InvoiceData | null
  contractors: ContractorData[]
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

export function EditInvoiceDialog({ invoice, contractors, open, onClose }: Props) {
  const [isPending, startTransition] = useTransition()
  const [number, setNumber] = useState("")
  const [contractorId, setContractorId] = useState("")
  const [date, setDate] = useState("")
  const [concept, setConcept] = useState("")
  const [totalAmount, setTotalAmount] = useState("")
  const [retentionRate, setRetentionRate] = useState("")
  const [bankInfo, setBankInfo] = useState("")
  const [notes, setNotes] = useState("")

  useEffect(() => {
    if (!invoice) return
    setNumber(invoice.number != null ? String(invoice.number) : "")
    setContractorId(invoice.contractorId)
    setDate(invoice.date.slice(0, 10))
    setConcept(invoice.concept)
    setTotalAmount(invoice.totalAmount)
    setRetentionRate(invoice.retentionRate != null ? String(invoice.retentionRate) : "")
    setBankInfo(invoice.bankInfo ?? "")
    setNotes(invoice.notes ?? "")
  }, [invoice])

  if (!invoice) return null

  const handleSave = () => {
    if (!concept.trim()) { toast.error("El concepto no puede estar vacío."); return }
    if (!date) { toast.error("La fecha es requerida."); return }
    const amount = parseFloat(totalAmount)
    if (isNaN(amount) || amount <= 0) { toast.error("El total debe ser mayor a 0."); return }
    const trimmedNumber = number.trim()
    if (trimmedNumber && (!/^\d+$/.test(trimmedNumber) || parseInt(trimmedNumber, 10) < 1)) {
      toast.error("El número debe ser un entero positivo.")
      return
    }

    startTransition(async () => {
      const payload: Parameters<typeof updateInvoice>[1] = {}

      if (contractorId !== invoice.contractorId) payload.contractorId = contractorId
      if (date !== invoice.date.slice(0, 10)) payload.date = date
      if (concept.trim() !== invoice.concept) payload.concept = concept.trim()
      if (amount !== parseFloat(invoice.totalAmount)) payload.totalAmount = amount
      const newRetentionRate = retentionRate ? parseFloat(retentionRate) : null
      if (newRetentionRate !== invoice.retentionRate) payload.retentionRate = newRetentionRate
      if ((bankInfo.trim() || null) !== invoice.bankInfo) payload.bankInfo = bankInfo.trim() || null
      if ((notes.trim() || null) !== invoice.notes) payload.notes = notes.trim() || null

      const newNumber = trimmedNumber ? parseInt(trimmedNumber, 10) : null
      const numberChanged = newNumber !== null && newNumber !== invoice.number

      if (Object.keys(payload).length === 0 && !numberChanged) { onClose(); return }

      const results = await Promise.all([
        Object.keys(payload).length > 0 ? updateInvoice(invoice.id, payload) : Promise.resolve({ error: null }),
        numberChanged ? updateInvoiceNumber(invoice.id, newNumber!) : Promise.resolve({ error: null }),
      ])

      const error = results.find((r) => r.error)?.error
      if (error) toast.error(error)
      else { toast.success("Cuenta de cobro actualizada."); onClose() }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg p-6">
        <DialogTitle>Editar cuenta de cobro</DialogTitle>

        <div className="mt-4 flex flex-col gap-4">
          <Field label="Número">
            <Input
              type="number"
              min="1"
              placeholder="—"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </Field>

          <Field label="Contratista">
            <select
              value={contractorId}
              onChange={(e) => setContractorId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>{c.name} — {c.idNumber}</option>
              ))}
            </select>
          </Field>

          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>

          <Field label="Concepto">
            <Input value={concept} onChange={(e) => setConcept(e.target.value)} />
          </Field>

          <Field label="Total">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
            />
          </Field>

          <Field label="Retención en la fuente">
            <select
              value={retentionRate}
              onChange={(e) => setRetentionRate(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— Sin retención —</option>
              {RETENTION_RATE_OPTIONS.map((rate) => (
                <option key={rate} value={rate}>{rate}%</option>
              ))}
            </select>
          </Field>

          <Field label="Datos bancarios">
            <Input
              placeholder="Cuenta de Ahorros Bancolombia # ..."
              value={bankInfo}
              onChange={(e) => setBankInfo(e.target.value)}
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
