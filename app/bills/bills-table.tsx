"use client"

import { useEffect, useMemo, useRef, useState, useTransition, useCallback } from "react"
import { toast } from "sonner"
import {
  deleteBill,
  uploadBillDocument,
  deleteBillDocument,
  updateBill,
  unlinkBillPayment,
  clearBillPaidInBill,
} from "./actions"
import type { BillData, BillStatus } from "@/lib/bills/document-data"
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MultiSelectFilter } from "@/components/ui/multi-select-filter"
import { EditBillDialog } from "./edit-bill-dialog"
import { PaidInBillDialog } from "./paid-in-bill-dialog"
import { ArrowDown, ArrowUp, Columns3, CornerDownRight, Download, Eye, Loader2, MoreHorizontal, Paperclip, Pencil, Trash2, Undo2, Unlink, X } from "lucide-react"

function money(v: string | number) {
  return "$" + Number(v).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })
}

// Today as a Colombia calendar date (YYYY-MM-DD). Pinned to the building's timezone so the
// server render and the client hydration agree on which bills are overdue, whatever timezone the
// server itself runs in.
function todayInColombia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" })
}

function formatMonth(iso: string) {
  const [y, m] = iso.slice(0, 7).split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" })
}

function isImageFile(fileName: string | null | undefined) {
  return /\.(jpe?g|png)$/i.test(fileName ?? "")
}

const STATUS_LABELS: Record<BillStatus, string> = {
  pagada: "Pagada",
  pendiente: "Pendiente",
}

function statusBadge(status: BillStatus) {
  if (status === "pagada") return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-400">Pagada</span>
  return <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Pendiente</span>
}

const COLUMN_KEYS = ["date", "dueDate", "paymentDate", "concept", "amount", "pending", "status", "accountingRecord", "document", "notes"] as const
type ColKey = typeof COLUMN_KEYS[number]

const COLUMN_LABELS: Record<ColKey, string> = {
  date: "Fecha",
  dueDate: "Fecha máx. pago",
  paymentDate: "Fecha de pago",
  concept: "Concepto",
  amount: "Monto",
  pending: "Pendiente por pagar",
  status: "Estado",
  accountingRecord: "Registro contable",
  document: "Documento",
  notes: "Notas",
}

const LS_KEY = "bills-hidden-cols"

function loadHiddenCols(): Set<ColKey> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return new Set(JSON.parse(raw) as ColKey[])
  } catch { /* */ }
  return new Set()
}

// Status and payment date are derived from the linked accounting record, so they're not here.
type EditableField = "date" | "dueDate" | "concept" | "amount" | "notes"

interface Props {
  bills: BillData[]
}

export function BillsTable({ bills }: Props) {
  const [, startTransition] = useTransition()
  const [toDelete, setToDelete] = useState<BillData | null>(null)
  const [toEdit, setToEdit] = useState<BillData | null>(null)
  const [toUnlink, setToUnlink] = useState<BillData | null>(null)
  // Bill being marked as "Pagada en otra factura".
  const [paidInTarget, setPaidInTarget] = useState<BillData | null>(null)
  // Bill whose document is being previewed.
  const [preview, setPreview] = useState<BillData | null>(null)
  // Inline double-click editing, same interaction as the Cuentas de cobro table: Enter or blur
  // saves, Escape cancels. `original` lets an untouched cell close without a pointless save.
  const [editing, setEditing] = useState<{ id: string; field: EditableField; original: string } | null>(null)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [hiddenCols, setHiddenCols] = useState<Set<ColKey>>(new Set())
  const [colsOpen, setColsOpen] = useState(false)
  const colsRef = useRef<HTMLDivElement>(null)
  // Oldest first by default — bills are worked through in the order they arrived.
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [yearFilter, setYearFilter] = useState<Set<string>>(new Set())
  const [monthFilter, setMonthFilter] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set())

  // Which bill the hidden file input's next selection should upload to — set right before
  // triggering the picker, read in onChange.
  const [uploadTarget, setUploadTarget] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setHiddenCols(loadHiddenCols()) }, [])

  const uniqueYears = Array.from(new Set(bills.map((b) => b.date.slice(0, 4)))).sort()
  const uniqueMonths = Array.from(
    new Map(bills.map((b) => [
      b.date.slice(0, 7),
      new Date(b.date).toLocaleDateString("es-CO", { month: "long", year: "numeric" }),
    ])).entries()
  ).sort((a, b) => a[0].localeCompare(b[0]))

  const hasActiveFilters = yearFilter.size > 0 || monthFilter.size > 0 || statusFilter.size > 0

  const filteredBills = bills.filter((b) => (
    (yearFilter.size === 0 || yearFilter.has(b.date.slice(0, 4))) &&
    (monthFilter.size === 0 || monthFilter.has(b.date.slice(0, 7))) &&
    (statusFilter.size === 0 || statusFilter.has(b.status))
  ))

  const sortedBills = useMemo(() => {
    const sign = sortDir === "asc" ? 1 : -1
    return [...filteredBills].sort((a, b) => (new Date(a.date).getTime() - new Date(b.date).getTime()) * sign)
  }, [filteredBills, sortDir])

  function sortIcon() {
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
  const today = todayInColombia()

  const startEdit = (b: BillData, field: EditableField) => {
    const value =
      field === "date" ? b.date.slice(0, 10)
      : field === "dueDate" ? (b.dueDate?.slice(0, 10) ?? "")
      : field === "concept" ? b.concept
      : field === "amount" ? b.amount
      : (b.notes ?? "")
    setEditing({ id: b.id, field, original: value })
    setDraft(value)
  }

  const cancelEdit = () => { setEditing(null); setDraft("") }

  const commitEdit = async () => {
    if (!editing || saving) return
    const { id, field, original } = editing
    const value = draft.trim()
    if (value === original.trim()) { cancelEdit(); return }

    let payload: Parameters<typeof updateBill>[1]
    if (field === "date") {
      if (!value) { cancelEdit(); return } // required — clearing it just reverts
      payload = { date: value }
    } else if (field === "dueDate") {
      payload = { dueDate: value || null } // optional — clearing it removes the deadline
    } else if (field === "concept") {
      if (!value) { cancelEdit(); return }
      payload = { concept: value }
    } else if (field === "amount") {
      // Checked here, not just server-side: updateBill only rejects amount <= 0, and NaN slips past that.
      const n = parseFloat(value)
      if (isNaN(n) || n <= 0) { toast.error("El monto debe ser mayor a 0."); cancelEdit(); return }
      payload = { amount: n }
    } else {
      payload = { notes: value || null }
    }

    setSaving(true)
    const res = await updateBill(id, payload)
    setSaving(false)
    if (res.error) toast.error(res.error)
    else toast.success("Guardado.")
    cancelEdit()
  }

  const onEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); commitEdit() }
    if (e.key === "Escape") cancelEdit()
  }

  // Render helper — NOT a component, so the input isn't remounted (losing focus) on every keystroke.
  const cellContent = (b: BillData, field: EditableField, display: React.ReactNode, type: "text" | "date" | "number" = "text") => {
    if (editing?.id !== b.id || editing.field !== field) return display
    return (
      <input
        autoFocus
        type={type}
        step={type === "number" ? "0.01" : undefined}
        min={type === "number" ? "0" : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={onEditKeyDown}
        disabled={saving}
        className={`h-7 rounded border border-primary bg-background px-1 text-sm ${type === "number" ? "w-32 text-right" : "w-full"}`}
      />
    )
  }

  const confirmDelete = () => {
    if (!toDelete) return
    const bill = toDelete
    setToDelete(null)
    startTransition(async () => {
      const res = await deleteBill(bill.id)
      if (res.error) toast.error(res.error)
      else toast.success("Factura eliminada.")
    })
  }

  const confirmUnlink = () => {
    const recordId = toUnlink?.accountingRecordId
    setToUnlink(null)
    if (!recordId) return
    startTransition(async () => {
      const res = await unlinkBillPayment(recordId)
      if (res.error) toast.error(res.error)
      else toast.success("Factura desvinculada del registro contable.")
    })
  }

  const handleClearPaidIn = (b: BillData) => {
    startTransition(async () => {
      const res = await clearBillPaidInBill(b.id)
      if (res.error) toast.error(res.error)
      else toast.success("La factura vuelve a quedar pendiente.")
    })
  }

  const handleAttachmentClick = (b: BillData) => {
    if (b.fileUrl) {
      setPreview(b)
      return
    }
    setUploadTarget(b.id)
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const billId = uploadTarget
    e.target.value = ""
    setUploadTarget(null)
    if (!file || !billId) return
    setUploadingId(billId)
    startTransition(async () => {
      const fd = new FormData()
      fd.append("file", file)
      const res = await uploadBillDocument(billId, fd)
      setUploadingId(null)
      if (res.error) toast.error(res.error)
      else toast.success("Factura subida.")
    })
  }

  const handleDeleteAttachment = (b: BillData) => {
    setDeletingAttachmentId(b.id)
    startTransition(async () => {
      const res = await deleteBillDocument(b.id)
      setDeletingAttachmentId(null)
      if (res.error) toast.error(res.error)
      else toast.success("Factura eliminada.")
    })
  }

  if (bills.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        No hay facturas. Crea la primera con &quot;Nueva factura&quot;.
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex items-center gap-3">
        <MultiSelectFilter
          label="Año"
          options={uniqueYears.map((y) => ({ value: y, label: y }))}
          selected={yearFilter}
          onChange={setYearFilter}
        />
        <MultiSelectFilter
          label="Mes"
          options={uniqueMonths.map(([key, label]) => ({ value: key, label }))}
          selected={monthFilter}
          onChange={setMonthFilter}
        />
        <MultiSelectFilter
          label="Estado"
          options={(Object.keys(STATUS_LABELS) as BillStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          selected={statusFilter}
          onChange={setStatusFilter}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setYearFilter(new Set())
            setMonthFilter(new Set())
            setStatusFilter(new Set())
          }}
          disabled={!hasActiveFilters}
          title="Limpiar todos los filtros"
        >
          Limpiar filtros
        </Button>
        <div ref={colsRef} className="relative ml-auto">
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

      {sortedBills.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          Ninguna factura coincide con los filtros.
        </div>
      ) : (
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto rounded-md border">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted text-left">
              {show("date") && (
                <th className="px-4 py-3 font-semibold whitespace-nowrap">
                  <button onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))} className="flex items-center gap-1 hover:text-foreground" title="Ordenar por fecha">
                    Fecha {sortIcon()}
                  </button>
                </th>
              )}
              {show("dueDate") && <th className="px-4 py-3 font-semibold whitespace-nowrap">Fecha máx. pago</th>}
              {show("paymentDate") && <th className="px-4 py-3 font-semibold whitespace-nowrap">Fecha de pago</th>}
              {show("concept") && <th className="px-4 py-3 font-semibold">Concepto</th>}
              {show("amount") && <th className="px-4 py-3 font-semibold whitespace-nowrap text-right">Monto</th>}
              {show("pending") && <th className="px-4 py-3 font-semibold whitespace-nowrap text-right">Pendiente por pagar</th>}
              {show("status") && <th className="px-4 py-3 font-semibold whitespace-nowrap text-center">Estado</th>}
              {show("accountingRecord") && <th className="px-4 py-3 font-semibold whitespace-nowrap text-center">Registro contable</th>}
              {show("document") && <th className="px-4 py-3 font-semibold whitespace-nowrap text-center">Documento</th>}
              {show("notes") && <th className="px-4 py-3 font-semibold">Notas</th>}
              <th className="px-4 py-3 font-semibold whitespace-nowrap" />
            </tr>
          </thead>
          <tbody>
            {sortedBills.map((b, i) => {
              // Unpaid past its deadline. A paid bill is never "overdue", however late it was paid.
              const overdue = b.status === "pendiente" && b.dueDate != null && b.dueDate.slice(0, 10) < today
              const pending = Number(b.pendingAmount)
              // Only a linked payment that doesn't match the bill is a discrepancy worth flagging —
              // an unlinked bill being fully pending is just the normal "not paid yet" state.
              const pendingClass =
                b.paidInBill && !b.accountingRecordId ? (b.status === "pagada" ? " text-muted-foreground" : "")
                : !b.accountingRecordId ? ""
                : pending > 0 ? " font-medium text-amber-600 dark:text-amber-400"
                : pending < 0 ? " font-medium text-blue-600 dark:text-blue-400"
                : " text-muted-foreground"
              const pendingTitle = b.paidInBill && !b.accountingRecordId
                ? `Se paga dentro de "${b.paidInBill.concept}"${b.status === "pagada" ? "" : ", que todavía no tiene pago"}`
                : !b.accountingRecordId
                ? "Sin pago registrado en contabilidad"
                : `Factura ${money(b.amount)} − pagado en contabilidad ${money(b.paidAmount)}${pending < 0 ? " (se pagó de más)" : ""}`

              return (
                <tr
                  key={b.id}
                  className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}
                  onDoubleClick={(e) => {
                    const target = e.target as HTMLElement
                    // Same guard as the accounting table: ignore double-clicks bubbled out of portals
                    // (the actions dropdown), inline-editable cells, and interactive controls.
                    if (!e.currentTarget.contains(target)) return
                    if (target.closest("[data-inline-edit], button, a, input, select, textarea, label")) return
                    setToEdit(b)
                  }}
                >
                  {show("date") && (
                    <td
                      data-inline-edit
                      className="px-4 py-3 whitespace-nowrap"
                      onDoubleClick={() => startEdit(b, "date")}
                      title="Doble clic para editar"
                    >
                      {cellContent(b, "date", formatDate(b.date), "date")}
                    </td>
                  )}

                  {show("dueDate") && (
                    <td
                      data-inline-edit
                      className={`px-4 py-3 whitespace-nowrap${overdue ? " font-medium text-red-600 dark:text-red-400" : ""}`}
                      onDoubleClick={() => startEdit(b, "dueDate")}
                      title={overdue ? "Vencida: la fecha máxima de pago ya pasó y la factura sigue pendiente" : "Doble clic para editar"}
                    >
                      {cellContent(b, "dueDate", b.dueDate ? formatDate(b.dueDate) : "—", "date")}
                    </td>
                  )}

                  {show("paymentDate") && (
                    <td
                      className="px-4 py-3 whitespace-nowrap"
                      title={
                        b.paymentDate
                          ? b.accountingRecordId ? "Fecha del registro de contabilidad vinculado como pago" : `Fecha del pago de "${b.paidInBill?.concept}", que incluyó esta factura`
                          : "Sin registro de contabilidad vinculado"
                      }
                    >
                      {b.paymentDate ? formatDate(b.paymentDate) : "—"}
                    </td>
                  )}

                  {show("concept") && (
                    <td
                      data-inline-edit
                      className="px-4 py-3 max-w-xs truncate"
                      onDoubleClick={() => startEdit(b, "concept")}
                      title={b.concept}
                    >
                      {cellContent(b, "concept", b.concept)}
                    </td>
                  )}

                  {show("amount") && (
                    <td
                      data-inline-edit
                      className="px-4 py-3 text-right whitespace-nowrap tabular-nums"
                      onDoubleClick={() => startEdit(b, "amount")}
                      title="Doble clic para editar"
                    >
                      {cellContent(b, "amount", money(b.amount), "number")}
                    </td>
                  )}

                  {show("pending") && (
                    <td className={`px-4 py-3 text-right whitespace-nowrap tabular-nums${pendingClass}`} title={pendingTitle}>
                      {pending < 0 ? `-${money(-pending)}` : money(pending)}
                    </td>
                  )}

                  {show("status") && (
                    <td className="px-4 py-3 text-center">
                      {statusBadge(b.status)}
                      {b.paidInBill && !b.accountingRecordId && (
                        <div className="mt-0.5 text-[11px] whitespace-nowrap text-muted-foreground" title={`Se pagó dentro de "${b.paidInBill.concept}"`}>
                          en factura {formatMonth(b.paidInBill.date)}
                        </div>
                      )}
                    </td>
                  )}

                  {/* Same short id (last 8 chars) the accounting table's "ID" column shows, and the
                      same /accounting#record-<id> link the abonos modal uses. */}
                  {show("accountingRecord") && (
                    <td className="px-4 py-3 text-center font-mono text-xs whitespace-nowrap">
                      {b.accountingRecordId ? (
                        <a
                          href={`/accounting#record-${b.accountingRecordId}`}
                          title={`Ver registro en Contabilidad (${b.accountingRecordId})`}
                          className="text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {b.accountingRecordId.slice(-8)}
                        </a>
                      ) : b.paidInBill?.accountingRecordId ? (
                        // Paid inside a later bill: point at that bill's payment, marked as indirect.
                        <a
                          href={`/accounting#record-${b.paidInBill.accountingRecordId}`}
                          title={`Pagada dentro de "${b.paidInBill.concept}" (registro ${b.paidInBill.accountingRecordId})`}
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-blue-600 hover:underline dark:hover:text-blue-400"
                        >
                          <CornerDownRight className="h-3 w-3" />
                          {b.paidInBill.accountingRecordId.slice(-8)}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  )}

                  {show("document") && (
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleAttachmentClick(b)}
                        disabled={uploadingId === b.id}
                        title={b.fileUrl ? "Ver factura" : "Adjuntar factura"}
                        className="mx-auto flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {uploadingId === b.id
                          ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          : b.fileUrl
                            ? <Eye className="h-4 w-4 text-blue-600 hover:text-blue-700" />
                            : <Paperclip className="h-4 w-4 text-muted-foreground hover:text-foreground" />}
                      </button>
                    </td>
                  )}

                  {show("notes") && (
                    <td
                      data-inline-edit
                      className="px-4 py-3 max-w-xs truncate text-muted-foreground"
                      onDoubleClick={() => startEdit(b, "notes")}
                      title={b.notes || "Doble clic para editar"}
                    >
                      {cellContent(b, "notes", b.notes ?? "—")}
                    </td>
                  )}

                  <td className="px-4 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="text-muted-foreground hover:text-primary" title="Acciones">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setToEdit(b)}>
                          <Pencil className="h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        {b.fileUrl && (
                          <DropdownMenuItem onSelect={() => handleDeleteAttachment(b)} disabled={deletingAttachmentId === b.id}>
                            <X className="h-4 w-4" />
                            Quitar factura
                          </DropdownMenuItem>
                        )}
                        {!b.accountingRecordId && (
                          <DropdownMenuItem onSelect={() => setPaidInTarget(b)}>
                            <CornerDownRight className="h-4 w-4" />
                            {b.paidInBill ? "Cambiar factura que la pagó" : "Pagada en otra factura…"}
                          </DropdownMenuItem>
                        )}
                        {b.paidInBill && !b.accountingRecordId && (
                          <DropdownMenuItem onSelect={() => handleClearPaidIn(b)}>
                            <Undo2 className="h-4 w-4" />
                            Quitar &quot;pagada en otra factura&quot;
                          </DropdownMenuItem>
                        )}
                        {b.accountingRecordId && (
                          <DropdownMenuItem onSelect={() => setToUnlink(b)}>
                            <Unlink className="h-4 w-4" />
                            Desvincular del registro contable
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => setToDelete(b)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}

      <EditBillDialog
        bill={toEdit}
        open={toEdit !== null}
        onClose={() => setToEdit(null)}
      />

      <PaidInBillDialog
        bill={paidInTarget}
        bills={bills}
        open={paidInTarget !== null}
        onClose={() => setPaidInTarget(null)}
      />

      <Dialog open={preview !== null} onOpenChange={(v) => { if (!v) setPreview(null) }}>
        <DialogContent className="w-full max-w-4xl gap-0 p-0">
          <div className="flex items-center justify-between border-b py-2 pl-4 pr-12">
            <DialogTitle className="text-sm font-medium">
              Factura — {preview?.fileName}
            </DialogTitle>
            {preview && (
              <a
                href={`/api/bills/${preview.id}/document`}
                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5" /> Descargar
              </a>
            )}
          </div>
          <DialogDescription className="sr-only">Previsualización del archivo</DialogDescription>
          {preview && (
            isImageFile(preview.fileName) ? (
              <div className="flex h-[80vh] w-full items-center justify-center overflow-auto bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/bills/${preview.id}/document`}
                  alt="Factura"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : (
              <iframe
                src={`/api/bills/${preview.id}/document`}
                title="Factura"
                className="h-[80vh] w-full"
              />
            )
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete !== null} onOpenChange={(v) => { if (!v) setToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar factura</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar la factura &quot;{toDelete?.concept}&quot; por {toDelete ? money(toDelete.amount) : ""}?
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

      <AlertDialog open={toUnlink !== null} onOpenChange={(v) => { if (!v) setToUnlink(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desvincular del registro contable</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Desvincular la factura &quot;{toUnlink?.concept}&quot; del registro contable{" "}
              {toUnlink?.accountingRecordId?.slice(-8)}
              {toUnlink ? ` (pagado ${money(toUnlink.paidAmount)})` : ""}? La factura vuelve a quedar pendiente
              y la podés vincular de nuevo desde Contabilidad.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUnlink}>Desvincular</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
