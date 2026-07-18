"use client"

import { useEffect, useMemo, useRef, useState, useTransition, useCallback } from "react"
import { toast } from "sonner"
import { deleteInvoice, updateInvoice, updateInvoiceNumber, type InvoiceData } from "./actions"
import type { ContractorData } from "../contractors/actions"
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
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { InvoiceAbonosModal } from "./abonos-modal"
import { EditInvoiceDialog } from "./edit-invoice-dialog"
import { InvoiceDocumentModal } from "./invoice-document-modal"
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Download, Eye, FileText, Pencil, Trash2 } from "lucide-react"

// Por ley, la retención en la fuente solo puede ser 4% o 6%.
// Kept in sync with VALID_RETENTION_RATES in actions.ts.
const RETENTION_RATE_OPTIONS = [4, 6]

function money(v: string | number) {
  return "$" + Number(v).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })
}

function statusBadge(pending: number, total: number) {
  if (pending <= 0) return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-400">Pagada</span>
  if (pending < total) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">Parcial</span>
  return <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Pendiente</span>
}

const COLUMN_KEYS = ["number", "date", "contractor", "concept", "total", "retention", "paid", "pending", "status", "abonos", "pdf"] as const
type ColKey = typeof COLUMN_KEYS[number]

const COLUMN_LABELS: Record<ColKey, string> = {
  number: "Número",
  contractor: "Contratista",
  date: "Fecha",
  concept: "Concepto",
  total: "Total",
  retention: "Retención",
  paid: "Abonado",
  pending: "Pendiente",
  status: "Estado",
  abonos: "Abonos",
  pdf: "PDF",
}

const LS_KEY = "invoices-hidden-cols"

function loadHiddenCols(): Set<ColKey> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return new Set(JSON.parse(raw) as ColKey[])
  } catch { /* */ }
  return new Set()
}

type EditingCell = { id: string; field: "number" | "contractorId" | "date" | "concept" | "totalAmount" | "retentionRate" }

interface Props {
  invoices: InvoiceData[]
  contractors: ContractorData[]
}

export function InvoicesTable({ invoices, contractors }: Props) {
  const [, startTransition] = useTransition()
  const [toDelete, setToDelete] = useState<InvoiceData | null>(null)
  const [toPreview, setToPreview] = useState<InvoiceData | null>(null)
  const [toAbonos, setToAbonos] = useState<InvoiceData | null>(null)
  const [toEdit, setToEdit] = useState<InvoiceData | null>(null)
  const [toDocument, setToDocument] = useState<InvoiceData | null>(null)
  const [hiddenCols, setHiddenCols] = useState<Set<ColKey>>(new Set())
  const [colsOpen, setColsOpen] = useState(false)
  const colsRef = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState<EditingCell | null>(null)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)
  const [sortField, setSortField] = useState<"number" | "date" | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  useEffect(() => { setHiddenCols(loadHiddenCols()) }, [])

  const toggleSort = (field: "number" | "date") => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortField(field); setSortDir("asc") }
  }

  const sortedInvoices = useMemo(() => {
    if (!sortField) return invoices
    const sign = sortDir === "asc" ? 1 : -1
    return [...invoices].sort((a, b) => {
      const cmp = sortField === "number"
        ? (a.number ?? -Infinity) - (b.number ?? -Infinity)
        : new Date(a.date).getTime() - new Date(b.date).getTime()
      return cmp * sign
    })
  }, [invoices, sortField, sortDir])

  function sortIcon(field: "number" | "date") {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
    return sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
  }

  const closeColsOnOutsideClick = useCallback((e: MouseEvent) => {
    if (colsRef.current && !colsRef.current.contains(e.target as Node)) setColsOpen(false)
  }, [])

  useEffect(() => {
    if (colsOpen) document.addEventListener("mousedown", closeColsOnOutsideClick)
    else document.removeEventListener("mousedown", closeColsOnOutsideClick)
    return () => document.removeEventListener("mousedown", closeColsOnOutsideClick)
  }, [colsOpen, closeColsOnOutsideClick])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const toggleCol = (key: ColKey) => {
    setHiddenCols((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      localStorage.setItem(LS_KEY, JSON.stringify([...next]))
      return next
    })
  }

  const show = (key: ColKey) => !hiddenCols.has(key)

  const startEdit = (inv: InvoiceData, field: EditingCell["field"]) => {
    let value = ""
    if (field === "number") value = inv.number != null ? String(inv.number) : ""
    else if (field === "contractorId") value = inv.contractorId
    else if (field === "date") value = inv.date.slice(0, 10)
    else if (field === "concept") value = inv.concept
    else if (field === "totalAmount") value = inv.totalAmount
    else if (field === "retentionRate") value = inv.retentionRate != null ? String(inv.retentionRate) : ""
    setEditing({ id: inv.id, field })
    setDraft(value)
  }

  const cancelEdit = () => { setEditing(null); setDraft("") }

  const commitEdit = async () => {
    if (!editing || saving) return
    const { id, field } = editing

    if (field === "number") {
      const n = parseInt(draft, 10)
      if (isNaN(n) || n < 1 || String(n) !== draft.trim()) { cancelEdit(); return }
      setSaving(true)
      const res = await updateInvoiceNumber(id, n)
      setSaving(false)
      if (res.error) toast.error(res.error)
      else toast.success("Guardado.")
      setEditing(null)
      setDraft("")
      return
    }

    setSaving(true)
    let payload: Parameters<typeof updateInvoice>[1] = {}
    if (field === "contractorId") payload = { contractorId: draft }
    else if (field === "date") payload = { date: draft }
    else if (field === "concept") payload = { concept: draft }
    else if (field === "totalAmount") payload = { totalAmount: parseFloat(draft) }
    else if (field === "retentionRate") payload = { retentionRate: draft ? parseFloat(draft) : null }
    const res = await updateInvoice(id, payload)
    setSaving(false)
    if (res.error) toast.error(res.error)
    else toast.success("Guardado.")
    setEditing(null)
    setDraft("")
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); commitEdit() }
    if (e.key === "Escape") cancelEdit()
  }

  const confirmDelete = () => {
    if (!toDelete) return
    const inv = toDelete
    setToDelete(null)
    startTransition(async () => {
      const res = await deleteInvoice(inv.id)
      if (res.error) toast.error(res.error)
      else toast.success("Cuenta de cobro eliminada.")
    })
  }

  if (invoices.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        No hay cuentas de cobro. Crea la primera con &quot;Nueva cuenta de cobro&quot;.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <div ref={colsRef} className="relative">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setColsOpen((v) => !v)}>
            <Columns3 className="h-4 w-4" />
            Columnas
          </Button>
          {colsOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border bg-popover p-2 shadow-md">
              <p className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">Mostrar columnas</p>
              {COLUMN_KEYS.map((key) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={show(key)}
                    onChange={() => toggleCol(key)}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  {COLUMN_LABELS[key]}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-left">
              {show("number") && (
                <th className="px-4 py-3 font-semibold whitespace-nowrap">
                  <button onClick={() => toggleSort("number")} className="flex items-center gap-1 hover:text-foreground" title="Ordenar por número">
                    Número {sortIcon("number")}
                  </button>
                </th>
              )}
              {show("date") && (
                <th className="px-4 py-3 font-semibold whitespace-nowrap">
                  <button onClick={() => toggleSort("date")} className="flex items-center gap-1 hover:text-foreground" title="Ordenar por fecha">
                    Fecha {sortIcon("date")}
                  </button>
                </th>
              )}
              {show("contractor") && <th className="px-4 py-3 font-semibold whitespace-nowrap">Contratista</th>}
              {show("concept") && <th className="px-4 py-3 font-semibold">Concepto</th>}
              {show("total") && <th className="px-4 py-3 font-semibold whitespace-nowrap text-right">Total</th>}
              {show("retention") && <th className="px-4 py-3 font-semibold whitespace-nowrap text-right">Retención</th>}
              {show("paid") && <th className="px-4 py-3 font-semibold whitespace-nowrap text-right">Abonado</th>}
              {show("pending") && <th className="px-4 py-3 font-semibold whitespace-nowrap text-right">Pendiente</th>}
              {show("status") && <th className="px-4 py-3 font-semibold whitespace-nowrap text-center">Estado</th>}
              {show("abonos") && <th className="px-4 py-3 font-semibold whitespace-nowrap">Abonos</th>}
              {show("pdf") && <th className="px-4 py-3 font-semibold whitespace-nowrap text-center">PDF</th>}
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sortedInvoices.map((inv, i) => {
              const isEditing = (field: EditingCell["field"]) => editing?.id === inv.id && editing.field === field

              return (
                <tr key={inv.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>

                  {show("number") && (
                    <td
                      className="px-4 py-3 whitespace-nowrap font-mono"
                      onDoubleClick={() => startEdit(inv, "number")}
                      title="Doble clic para editar"
                    >
                      {isEditing("number") ? (
                        <input
                          ref={(el) => { inputRef.current = el }}
                          type="number"
                          min={1}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={onKeyDown}
                          disabled={saving}
                          className="h-7 w-20 rounded border border-primary bg-background px-1 text-sm"
                        />
                      ) : (
                        <span className="cursor-default select-none">
                          {inv.number != null ? String(inv.number).padStart(4, "0") : "—"}
                        </span>
                      )}
                    </td>
                  )}

                  {show("date") && (
                    <td
                      className="px-4 py-3 whitespace-nowrap"
                      onDoubleClick={() => startEdit(inv, "date")}
                      title="Doble clic para editar"
                    >
                      {isEditing("date") ? (
                        <input
                          ref={(el) => { inputRef.current = el }}
                          type="date"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={onKeyDown}
                          disabled={saving}
                          className="h-7 rounded border border-primary bg-background px-1 text-sm"
                        />
                      ) : (
                        <span className="cursor-default select-none">{formatDate(inv.date)}</span>
                      )}
                    </td>
                  )}

                  {show("contractor") && (
                    <td
                      className="px-4 py-3 whitespace-nowrap font-medium"
                      onDoubleClick={() => startEdit(inv, "contractorId")}
                      title="Doble clic para editar"
                    >
                      {isEditing("contractorId") ? (
                        <select
                          ref={(el) => { inputRef.current = el }}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={onKeyDown}
                          disabled={saving}
                          className="h-7 rounded border border-primary bg-background px-1 text-sm"
                        >
                          {contractors.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="cursor-default select-none">{inv.contractorName}</span>
                      )}
                    </td>
                  )}

                  {show("concept") && (
                    <td
                      className="px-4 py-3 max-w-xs truncate"
                      onDoubleClick={() => startEdit(inv, "concept")}
                      title={inv.concept}
                    >
                      {isEditing("concept") ? (
                        <input
                          ref={(el) => { inputRef.current = el }}
                          type="text"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={onKeyDown}
                          disabled={saving}
                          className="h-7 w-full rounded border border-primary bg-background px-1 text-sm"
                        />
                      ) : (
                        <span className="cursor-default select-none">{inv.concept}</span>
                      )}
                    </td>
                  )}

                  {show("total") && (
                    <td
                      className="px-4 py-3 text-right whitespace-nowrap tabular-nums"
                      onDoubleClick={() => startEdit(inv, "totalAmount")}
                      title="Doble clic para editar"
                    >
                      {isEditing("totalAmount") ? (
                        <input
                          ref={(el) => { inputRef.current = el }}
                          type="number"
                          step="0.01"
                          min="0"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={onKeyDown}
                          disabled={saving}
                          className="h-7 w-32 rounded border border-primary bg-background px-1 text-right text-sm"
                        />
                      ) : (
                        <span className="cursor-default select-none">{money(inv.totalAmount)}</span>
                      )}
                    </td>
                  )}

                  {show("retention") && (
                    <td
                      className="px-4 py-3 text-right whitespace-nowrap tabular-nums"
                      onDoubleClick={() => startEdit(inv, "retentionRate")}
                      title="Doble clic para editar"
                    >
                      {isEditing("retentionRate") ? (
                        <select
                          ref={(el) => { inputRef.current = el }}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={onKeyDown}
                          disabled={saving}
                          className="h-7 rounded border border-primary bg-background px-1 text-sm"
                        >
                          <option value="">— Sin retención —</option>
                          {RETENTION_RATE_OPTIONS.map((rate) => (
                            <option key={rate} value={rate}>{rate}%</option>
                          ))}
                        </select>
                      ) : (
                        <span className="cursor-default select-none">
                          {inv.retentionRate != null ? `${inv.retentionRate}%` : "—"}
                        </span>
                      )}
                    </td>
                  )}

                  {show("paid") && (
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">{money(inv.paid)}</td>
                  )}
                  {show("pending") && (
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums font-semibold">{money(inv.pending)}</td>
                  )}
                  {show("status") && (
                    <td className="px-4 py-3 text-center">{statusBadge(Number(inv.pending), Number(inv.totalAmount))}</td>
                  )}

                  {show("abonos") && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      {inv.abonos.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <button
                          onClick={() => setToAbonos(inv)}
                          className="flex flex-nowrap items-center gap-1 text-left"
                          title="Ver abonos"
                        >
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                            {inv.abonos.length}
                          </span>
                          {inv.abonos.map((a) =>
                            a.voucherNumber != null ? (
                              <span key={a.id} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-mono text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                {String(a.voucherNumber).padStart(4, "0")}
                              </span>
                            ) : null
                          )}
                        </button>
                      )}
                    </td>
                  )}

                  {show("pdf") && (
                    <td className="px-4 py-3">
                      {inv.fileUrl ? (
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => setToPreview(inv)} className="inline-flex text-muted-foreground hover:text-blue-600" title="Ver PDF">
                            <Eye className="h-4 w-4" />
                          </button>
                          <a href={`/api/invoices/${inv.id}/download`} className="inline-flex text-muted-foreground hover:text-foreground" title="Descargar PDF">
                            <Download className="h-4 w-4" />
                          </a>
                        </div>
                      ) : (
                        <span className="block text-center text-muted-foreground">—</span>
                      )}
                    </td>
                  )}

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setToDocument(inv)} className="text-muted-foreground hover:text-blue-600" title="Ver cuenta de cobro (generada)">
                        <FileText className="h-4 w-4" />
                      </button>
                      <button onClick={() => setToEdit(inv)} className="text-muted-foreground hover:text-primary" title="Editar">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => setToDelete(inv)} className="text-muted-foreground hover:text-destructive" title="Eliminar">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <InvoiceAbonosModal
        invoice={toAbonos}
        open={toAbonos !== null}
        onClose={() => setToAbonos(null)}
      />

      <EditInvoiceDialog
        invoice={toEdit}
        contractors={contractors}
        open={toEdit !== null}
        onClose={() => setToEdit(null)}
      />

      <InvoiceDocumentModal
        invoice={toDocument}
        open={toDocument !== null}
        onClose={() => setToDocument(null)}
        contractors={contractors}
      />

      <Dialog open={toPreview !== null} onOpenChange={(v) => { if (!v) setToPreview(null) }}>
        <DialogContent className="w-full max-w-4xl gap-0 p-0">
          <div className="flex items-center justify-between border-b py-2 pl-4 pr-12">
            <DialogTitle className="text-sm font-medium">
              Cuenta de cobro — {toPreview?.contractorName}
            </DialogTitle>
            {toPreview && (
              <a href={`/api/invoices/${toPreview.id}/download`} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium hover:bg-muted">
                <Download className="h-3.5 w-3.5" /> Descargar
              </a>
            )}
          </div>
          <DialogDescription className="sr-only">Previsualización del PDF de la cuenta de cobro</DialogDescription>
          {toPreview && (
            <iframe src={`/api/invoices/${toPreview.id}/download`} title="Cuenta de cobro" className="h-[80vh] w-full" />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete !== null} onOpenChange={(v) => { if (!v) setToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cuenta de cobro</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar la cuenta de cobro de {toDelete?.contractorName} por {toDelete ? money(toDelete.totalAmount) : ""}?
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 focus-visible:ring-red-600">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
