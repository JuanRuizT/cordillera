"use client"

import { Fragment, useEffect, useState } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Trash2, Paperclip } from "lucide-react"
import {
  listInvoiceAbonos,
  listLinkableEgresos,
  linkEgreso,
  unlinkEgreso,
  addManualAbono,
  deleteManualAbono,
  type InvoiceData,
  type AbonoRow,
} from "./actions"
import { PaymentProofsDialog } from "../accounting/payment-proofs-dialog"
import { computeInvoiceFinancials } from "@/lib/invoice-financials"

function money(v: string | number) {
  return "$" + Number(v).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })
}

interface Props {
  invoice: InvoiceData | null
  open: boolean
  onClose: () => void
}

export function InvoiceAbonosModal({ invoice, open, onClose }: Props) {
  const [abonos, setAbonos] = useState<AbonoRow[]>([])
  const [linkable, setLinkable] = useState<AbonoRow[]>([])
  const [selected, setSelected] = useState("")
  const [manualDate, setManualDate] = useState("")
  const [manualAmount, setManualAmount] = useState("")
  const [manualConcept, setManualConcept] = useState("Abono previo")
  const [busy, setBusy] = useState(false)
  const [proofsAbonoId, setProofsAbonoId] = useState<string | null>(null)

  const refresh = async (invoiceId: string) => {
    const [a, l] = await Promise.all([listInvoiceAbonos(invoiceId), listLinkableEgresos()])
    setAbonos(a)
    setLinkable(l)
    setSelected("")
    setManualDate("")
    setManualAmount("")
    setManualConcept("Abono previo")
  }

  useEffect(() => {
    if (!open || !invoice) return
    refresh(invoice.id)
  }, [open, invoice])

  if (!invoice) return null

  const total = Number(invoice.totalAmount)
  const rate = invoice.retentionRate
  const paid = abonos.reduce((s, a) => s + Number(a.amount), 0)
  const { retentionAmount, netAmount, pending } = computeInvoiceFinancials(total, rate, paid)

  const add = async () => {
    if (!selected || busy) return
    setBusy(true)
    try {
      const res = await linkEgreso(selected, invoice.id)
      if (res.error) toast.error(res.error)
      else { toast.success("Abono agregado."); await refresh(invoice.id) }
    } finally {
      setBusy(false)
    }
  }

  const remove = async (row: AbonoRow) => {
    if (busy) return
    setBusy(true)
    try {
      const res = row.source === "manual" ? await deleteManualAbono(row.id) : await unlinkEgreso(row.id)
      if (res.error) toast.error(res.error)
      else { toast.success("Abono quitado."); await refresh(invoice.id) }
    } finally {
      setBusy(false)
    }
  }

  const addManual = async () => {
    if (busy) return
    const amount = parseFloat(manualAmount)
    if (!manualDate || isNaN(amount) || amount <= 0 || !manualConcept.trim()) return
    setBusy(true)
    try {
      const res = await addManualAbono(invoice.id, { date: manualDate, amount, concept: manualConcept.trim() })
      if (res.error) toast.error(res.error)
      else { toast.success("Abono agregado."); await refresh(invoice.id) }
    } finally {
      setBusy(false)
    }
  }

  const proofsAbono = abonos.find((a) => a.id === proofsAbonoId) ?? null

  return (
    <Fragment>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
        <DialogContent className="max-w-3xl p-6">
          <div className="flex flex-col gap-1">
            <DialogTitle>Abonos — {invoice.contractorName}</DialogTitle>
            <DialogDescription>{invoice.concept}</DialogDescription>
          </div>

          <div className={`my-3 grid gap-3 rounded-md border p-3 text-sm ${rate != null ? "grid-cols-5" : "grid-cols-3"}`}>
            <div><div className="text-xs text-muted-foreground">Total</div><div className="font-medium tabular-nums">{money(total)}</div></div>
            {rate != null && (
              <>
                <div><div className="text-xs text-muted-foreground">Retención {rate}%</div><div className="font-medium tabular-nums">{money(retentionAmount)}</div></div>
                <div><div className="text-xs text-muted-foreground">Neto a pagar</div><div className="font-medium tabular-nums">{money(netAmount)}</div></div>
              </>
            )}
            <div><div className="text-xs text-muted-foreground">Abonado</div><div className="font-medium tabular-nums">{money(paid)}</div></div>
            <div><div className="text-xs text-muted-foreground">Pendiente</div><div className="font-semibold tabular-nums">{money(pending)}</div></div>
          </div>

          {/* Abonos ligados */}
          <div className="rounded-md border">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="w-24 py-2 pl-3 pr-6 font-medium text-center">ID</th>
                  <th className="w-36 px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Concepto</th>
                  <th className="w-28 px-3 py-2 font-medium text-right">Monto</th>
                  <th className="w-14 px-3 py-2 font-medium text-center">Pago</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {abonos.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Sin abonos aún.</td></tr>
                ) : abonos.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="w-24 py-2 pl-3 pr-6 text-center font-mono text-xs">
                      {a.accountingRecordId ? (
                        <a
                          href={`/accounting#record-${a.accountingRecordId}`}
                          title="Ver registro en Contabilidad"
                          className="text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {a.accountingRecordId.slice(-8)}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="w-36 overflow-hidden px-3 py-2 text-ellipsis whitespace-nowrap">{formatDate(a.date)}</td>
                    <td
                      className={`overflow-hidden px-3 py-2 text-ellipsis whitespace-nowrap${a.source === "record" && a.paymentProofs.length === 0 ? " underline decoration-amber-500 dark:decoration-amber-600" : ""}`}
                      title={a.concept}
                    >
                      {a.concept}
                    </td>
                    <td className="w-28 px-3 py-2 text-right tabular-nums">{money(a.amount)}</td>
                    <td className="w-14 px-3 py-2 text-center">
                      {a.source === "manual" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <button
                          onClick={() => setProofsAbonoId(a.id)}
                          title="Comprobantes de pago"
                          className="inline-flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground"
                        >
                          <Paperclip className="h-4 w-4" />
                          {a.paymentProofs.length > 0 && <span className="text-xs tabular-nums">{a.paymentProofs.length}</span>}
                        </button>
                      )}
                    </td>
                    <td className="w-10 px-3 py-2">
                      <button onClick={() => remove(a)} disabled={busy} className="text-muted-foreground hover:text-destructive disabled:opacity-50" title="Quitar abono">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Agregar abono */}
          <div className="mt-4 flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-sm font-medium">Agregar abono (Egreso/Retención sin ligar)</label>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">— Selecciona un registro —</option>
                {linkable.map((e) => (
                  <option key={e.id} value={e.id}>{formatDate(e.date)} — {e.concept} ({money(e.amount)})</option>
                ))}
              </select>
            </div>
            <Button onClick={add} disabled={!selected || busy}>Agregar</Button>
          </div>
          {linkable.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">No hay registros sin ligar. Crea un registro de categoría &quot;Egreso&quot; o &quot;Retención en la fuente&quot; en Contabilidad.</p>
          )}

          {/* Agregar abono manual (sin registro en contabilidad) */}
          <div className="mt-4 border-t pt-4">
            <label className="text-sm font-medium">Agregar abono manual (sin registro en contabilidad)</label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Para pagos ya realizados (p. ej. por la administración anterior) que no tienen un egreso en Contabilidad.
            </p>
            <div className="mt-2 flex items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">Fecha</label>
                <Input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="h-9 w-36" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">Monto</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  className="h-9 w-32"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">Concepto</label>
                <Input value={manualConcept} onChange={(e) => setManualConcept(e.target.value)} className="h-9" />
              </div>
              <Button onClick={addManual} disabled={busy || !manualDate || !manualAmount || !manualConcept.trim()}>
                Agregar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PaymentProofsDialog
        accountingRecordId={proofsAbono?.accountingRecordId ?? null}
        proofs={proofsAbono?.paymentProofs ?? []}
        open={proofsAbonoId !== null}
        onClose={() => setProofsAbonoId(null)}
        onChanged={() => invoice && refresh(invoice.id)}
      />
    </Fragment>
  )
}
