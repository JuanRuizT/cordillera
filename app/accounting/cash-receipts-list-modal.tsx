"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Eye, Trash2 } from "lucide-react"
import {
  listCashReceipts,
  addCashReceipt,
  updateCashReceiptNumber,
  updateCashReceiptConcept,
  updateCashReceiptAmount,
  deleteCashReceipt,
  type CashReceiptData,
} from "./actions"

function money(value: string | number) {
  return "$" + Number(value).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

type EditField = "number" | "concept" | "amount"
type EditingCell = { id: string; field: EditField } | null

const inputClass = "h-7 rounded border border-primary bg-background px-1.5 text-sm shadow-none"

interface CashReceiptsListModalProps {
  accountingRecordId: string | null
  open: boolean
  onClose: () => void
  onViewReceipt: (receipt: CashReceiptData) => void
}

export function CashReceiptsListModal({ accountingRecordId, open, onClose, onViewReceipt }: CashReceiptsListModalProps) {
  const [loading, setLoading] = useState(false)
  const [receipts, setReceipts] = useState<CashReceiptData[]>([])
  const [recordAmount, setRecordAmount] = useState("0")
  const [recordConcept, setRecordConcept] = useState("")
  const [editing, setEditing] = useState<EditingCell>(null)
  const [draft, setDraft] = useState("")
  const [savingId, setSavingId] = useState<string | null>(null)
  const [delConfirmId, setDelConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [draftAmount, setDraftAmount] = useState("")
  const [draftConcept, setDraftConcept] = useState("")
  const [addSaving, setAddSaving] = useState(false)

  async function load(id: string) {
    setLoading(true)
    const res = await listCashReceipts(id)
    setLoading(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    setReceipts(res.receipts)
    setRecordAmount(res.recordAmount)
    setRecordConcept(res.recordConcept)
  }

  useEffect(() => {
    if (open && accountingRecordId) {
      load(accountingRecordId)
    } else {
      setReceipts([])
      setEditing(null)
      setShowAddForm(false)
      setDelConfirmId(null)
    }
  }, [open, accountingRecordId])

  const totalSoFar = receipts.reduce((sum, r) => sum + Number(r.amount), 0)
  const remaining = Math.max(Number(recordAmount) - totalSoFar, 0)
  const difference = Number(recordAmount) - totalSoFar
  const matches = difference === 0

  function startEdit(id: string, field: EditField, value: string) {
    setEditing({ id, field })
    setDraft(value)
  }

  function cancelEdit() {
    setEditing(null)
    setDraft("")
  }

  async function commitEdit() {
    if (!editing || !accountingRecordId) return
    const { id, field } = editing
    const trimmed = draft.trim()
    setEditing(null)

    if (field === "number") {
      const n = parseInt(trimmed, 10)
      if (isNaN(n) || n < 1) return
      setSavingId(id)
      const res = await updateCashReceiptNumber(id, n)
      setSavingId(null)
      if (res.error) { toast.error(res.error); return }
      await load(accountingRecordId)
      return
    }

    if (field === "concept") {
      if (!trimmed) return
      setSavingId(id)
      const res = await updateCashReceiptConcept(id, trimmed)
      setSavingId(null)
      if (res.error) { toast.error(res.error); return }
      await load(accountingRecordId)
      return
    }

    // amount
    setSavingId(id)
    const res = await updateCashReceiptAmount(id, trimmed)
    setSavingId(null)
    if (res.error) { toast.error(res.error); return }
    await load(accountingRecordId)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); commitEdit() }
    if (e.key === "Escape") { e.preventDefault(); cancelEdit() }
  }

  function openAddForm() {
    setDraftAmount(remaining > 0 ? String(remaining) : "")
    setDraftConcept(recordConcept)
    setShowAddForm(true)
  }

  async function saveDraft() {
    if (!accountingRecordId) return
    setAddSaving(true)
    const res = await addCashReceipt(accountingRecordId, draftAmount, draftConcept)
    setAddSaving(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    setShowAddForm(false)
    toast.success(`Recibo N° ${res.receipt ? String(res.receipt.number).padStart(4, "0") : ""} agregado.`)
    await load(accountingRecordId)
  }

  async function runDelete() {
    if (!delConfirmId || !accountingRecordId) return
    setDeleting(true)
    const res = await deleteCashReceipt(delConfirmId)
    setDeleting(false)
    setDelConfirmId(null)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success("Recibo borrado.")
    const fresh = await listCashReceipts(accountingRecordId)
    if (fresh.error || fresh.receipts.length === 0) {
      onClose()
      return
    }
    setReceipts(fresh.receipts)
    setRecordAmount(fresh.recordAmount)
    setRecordConcept(fresh.recordConcept)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
        <DialogContent className="max-w-2xl p-6">
          <div className="flex flex-col gap-1">
            <DialogTitle>Recibos de caja</DialogTitle>
            <DialogDescription>{recordConcept || "Cargando…"}</DialogDescription>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Cargando…</div>
          ) : (
            <>
              <div className="my-3 grid grid-cols-3 gap-3 rounded-md border p-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Monto del pago</div>
                  <div className="font-medium tabular-nums">{money(recordAmount)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total en recibos</div>
                  <div className="font-medium tabular-nums">{money(totalSoFar)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Diferencia</div>
                  <div className={`font-semibold tabular-nums ${matches ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}>
                    {matches ? "Cuadra ✓" : money(difference)}
                  </div>
                </div>
              </div>

              <div className="rounded-md border">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-left">
                      <th className="w-20 px-3 py-2 font-medium">N°</th>
                      <th className="px-3 py-2 font-medium">Concepto</th>
                      <th className="w-32 px-3 py-2 text-right font-medium">Monto</th>
                      <th className="w-16 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.length === 0 && !showAddForm ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Sin recibos.</td>
                      </tr>
                    ) : receipts.map((r) => {
                      const busy = savingId === r.id
                      return (
                        <tr key={r.id} className={`border-t${busy ? " opacity-60" : ""}`}>
                          <td className="px-3 py-2 font-mono">
                            {editing?.id === r.id && editing.field === "number" ? (
                              <input
                                autoFocus
                                type="number"
                                min={1}
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={handleKeyDown}
                                className={`${inputClass} w-16`}
                              />
                            ) : (
                              <span
                                className="cursor-default select-none"
                                onDoubleClick={() => !busy && startEdit(r.id, "number", String(r.number))}
                                title="Doble clic para editar"
                              >
                                {String(r.number).padStart(4, "0")}
                              </span>
                            )}
                          </td>
                          <td className="overflow-hidden px-3 py-2 text-ellipsis whitespace-nowrap">
                            {editing?.id === r.id && editing.field === "concept" ? (
                              <input
                                autoFocus
                                type="text"
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={handleKeyDown}
                                className={`${inputClass} w-full`}
                              />
                            ) : (
                              <span
                                className="cursor-default select-none"
                                onDoubleClick={() => !busy && startEdit(r.id, "concept", r.concept)}
                                title={r.concept}
                              >
                                {r.concept}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {editing?.id === r.id && editing.field === "amount" ? (
                              <input
                                autoFocus
                                type="number"
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={handleKeyDown}
                                className={`${inputClass} w-28 text-right`}
                              />
                            ) : (
                              <span
                                className="cursor-default select-none"
                                onDoubleClick={() => !busy && startEdit(r.id, "amount", r.amount)}
                                title="Doble clic para editar"
                              >
                                {money(r.amount)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-3">
                              <button onClick={() => onViewReceipt(r)} title="Ver recibo" className="text-blue-600 hover:text-blue-700">
                                <Eye className="h-4 w-4" />
                              </button>
                              <button onClick={() => setDelConfirmId(r.id)} title="Borrar recibo" className="text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}

                    {showAddForm && (
                      <tr className="border-t bg-muted/30">
                        <td className="px-3 py-2 text-xs text-muted-foreground">Nuevo</td>
                        <td className="px-3 py-2">
                          <Input
                            autoFocus
                            value={draftConcept}
                            onChange={(e) => setDraftConcept(e.target.value)}
                            className="h-7 text-sm shadow-none"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            value={draftAmount}
                            onChange={(e) => setDraftAmount(e.target.value)}
                            className="h-7 text-right text-sm shadow-none"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                            <Button size="sm" className="h-7 px-2 text-xs" onClick={saveDraft} disabled={addSaving}>
                              {addSaving ? "Guardando…" : "Guardar"}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setShowAddForm(false)} disabled={addSaving}>
                              Cancelar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {!showAddForm && (
                <Button variant="outline" size="sm" onClick={openAddForm} className="mt-3">
                  + Agregar recibo
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={delConfirmId !== null} onOpenChange={(v) => { if (!v) setDelConfirmId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Borrar recibo</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer y el número no se reutilizará.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={runDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 focus-visible:ring-red-600"
            >
              {deleting ? "Borrando…" : "Borrar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
