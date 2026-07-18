"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { listContractors, createContractorInline, type ContractorData } from "../contractors/actions"
import { listOpenInvoicesByContractor, type OpenInvoice } from "../invoices/actions"
import { generateExpenseVoucher, type ExpenseVoucherData } from "./actions"

function money(v: string | number) {
  return "$" + Number(v).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

interface Props {
  recordId: string | null
  recordAmount?: number
  recordInvoiceLabel?: string | null
  open: boolean
  onClose: () => void
  onGenerated: (voucher: ExpenseVoucherData) => void
}

export function GenerateExpenseVoucherDialog({ recordId, recordAmount, recordInvoiceLabel, open, onClose, onGenerated }: Props) {
  const [contractors, setContractors] = useState<ContractorData[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedId, setSelectedId] = useState("")
  const [creatingNew, setCreatingNew] = useState(false)
  const [newName, setNewName] = useState("")
  const [newIdType, setNewIdType] = useState("CC")
  const [newIdNumber, setNewIdNumber] = useState("")
  const [invoices, setInvoices] = useState<OpenInvoice[]>([])
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("")

  useEffect(() => {
    if (!open) return
    setLoading(true)
    listContractors()
      .then((list) => {
        setContractors(list)
        setCreatingNew(list.length === 0)
        if (list.length > 0) {
          setSelectedId(list[0].id)
        }
      })
      .finally(() => setLoading(false))
  }, [open])

  useEffect(() => {
    if (!open || creatingNew || !selectedId) {
      setInvoices([])
      setSelectedInvoiceId("")
      return
    }
    listOpenInvoicesByContractor(selectedId).then((list) => {
      setInvoices(list)
      setSelectedInvoiceId("")
    })
  }, [open, creatingNew, selectedId])

  const onSelectContractor = (id: string) => setSelectedId(id)

  const handleGenerate = async () => {
    if (!recordId || submitting) return
    setSubmitting(true)
    try {
      // Egreso already linked to a cuenta de cobro → contractor is inherited from it.
      if (recordInvoiceLabel) {
        const res = await generateExpenseVoucher(recordId, null)
        if (res.voucher) {
          onGenerated(res.voucher)
          toast.success(`Comprobante N° ${String(res.voucher.number).padStart(4, "0")} generado.`)
        } else {
          toast.error(res.error ?? "No se pudo generar el comprobante.")
        }
        return
      }

      let contractorId = selectedId
      if (creatingNew) {
        const res = await createContractorInline({ name: newName, idType: newIdType, idNumber: newIdNumber })
        if (res.error || !res.contractor) {
          toast.error(res.error ?? "No se pudo crear el contratista.")
          return
        }
        contractorId = res.contractor.id
      }
      if (!contractorId) {
        toast.error("Selecciona o crea un contratista.")
        return
      }
      if (selectedInvoiceId && recordAmount != null) {
        const inv = invoices.find((i) => i.id === selectedInvoiceId)
        if (inv && recordAmount > Number(inv.pending)) {
          toast.warning(`El abono (${money(recordAmount)}) supera el pendiente de la cuenta de cobro (${money(inv.pending)}).`)
        }
      }
      const res = await generateExpenseVoucher(recordId, contractorId, selectedInvoiceId || null)
      if (res.voucher) {
        onGenerated(res.voucher)
        toast.success(`Comprobante N° ${String(res.voucher.number).padStart(4, "0")} generado.`)
      } else {
        toast.error(res.error ?? "No se pudo generar el comprobante.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md p-6">
        <div className="flex flex-col gap-1.5">
          <DialogTitle>Generar comprobante de egreso</DialogTitle>
          <DialogDescription>Selecciona el contratista. La forma de pago se toma de la columna &quot;Cuenta&quot; del registro.</DialogDescription>
        </div>

        <div className="flex flex-col gap-4 py-2">
          {recordInvoiceLabel && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="text-xs text-muted-foreground">Abona a la cuenta de cobro</div>
              <div className="font-medium">{recordInvoiceLabel}</div>
              <div className="mt-1 text-xs text-muted-foreground">El beneficiario se toma del contratista de la cuenta.</div>
            </div>
          )}

          {!recordInvoiceLabel && !creatingNew && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Contratista</label>
              <select
                value={selectedId}
                onChange={(e) => onSelectContractor(e.target.value)}
                disabled={loading}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.idNumber}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setCreatingNew(true)}
                className="self-start text-xs text-primary hover:underline"
              >
                + Crear nuevo contratista
              </button>
            </div>
          )}

          {!recordInvoiceLabel && creatingNew && (
            <div className="flex flex-col gap-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Nuevo contratista</span>
                {contractors.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCreatingNew(false)}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Usar existente
                  </button>
                )}
              </div>
              <Input placeholder="Nombre o razón social" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <div className="grid grid-cols-[90px_1fr] gap-2">
                <select
                  value={newIdType}
                  onChange={(e) => setNewIdType(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="CC">C.C</option>
                  <option value="NIT">NIT</option>
                </select>
                <Input placeholder="C.C / NIT" value={newIdNumber} onChange={(e) => setNewIdNumber(e.target.value)} />
              </div>
            </div>
          )}

          {!recordInvoiceLabel && !creatingNew && invoices.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Cuenta de cobro (opcional)</label>
              <select
                value={selectedInvoiceId}
                onChange={(e) => setSelectedInvoiceId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">— Ninguna (egreso suelto) —</option>
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.concept} — pendiente {money(inv.pending)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleGenerate} disabled={submitting || loading}>
            {submitting ? "Generando…" : "Generar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
