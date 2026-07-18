"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { toast } from "sonner"
import { deleteAccountingRecords, updateAccountingRecord, reclassifyRecord, generateCashReceipt, generateCashReceiptsBulk, deleteCashReceiptsBulk, uploadPaymentProof, deletePaymentProof, uploadFactura, deleteFactura } from "./actions"
import type { CashReceiptData, ExpenseVoucherData } from "./actions"
import { getInvoiceLiveData, type OpenInvoiceOption, type InvoiceData } from "../invoices/actions"
import type { ContractorData } from "../contractors/actions"
import type { FinancialAccountData } from "../accounts/actions"
import { Button } from "@/components/ui/button"
import { CategoryCombobox } from "@/components/ui/category-combobox"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { CashReceiptModal } from "./cash-receipt-modal"
import { CashReceiptsListModal } from "./cash-receipts-list-modal"
import { ExpenseVoucherModal } from "./expense-voucher-modal"
import { GenerateExpenseVoucherDialog } from "./generate-voucher-dialog"
import { LinkInvoiceDialog } from "./link-invoice-dialog"
import { InvoiceDocumentModal } from "../invoices/invoice-document-modal"
import { EditRecordDialog } from "./edit-record-dialog"
import { Columns3, Download, Eye, FileText, Loader2, Paperclip, Pencil, Sparkles, Trash2, X } from "lucide-react"

const COLUMNS = [
  { id: "date",           label: "Fecha",               defaultVisible: true },
  { id: "account",        label: "Cuenta",              defaultVisible: false },
  { id: "movement",       label: "Movimiento",          defaultVisible: false },
  { id: "concept",        label: "Concepto",            defaultVisible: true },
  { id: "income",         label: "Ingreso",             defaultVisible: true },
  { id: "expenses",       label: "Egreso",              defaultVisible: true },
  { id: "balance",        label: "Balance",             defaultVisible: true },
  { id: "category",       label: "Categoría",           defaultVisible: true },
  { id: "property",       label: "Propiedad",           defaultVisible: true },
  { id: "cashReceipt",    label: "Recibo de Caja",      defaultVisible: true },
  { id: "expenseVoucher", label: "Comprobante Egreso",  defaultVisible: true },
  { id: "invoiceLink",    label: "Cuenta de Cobro",     defaultVisible: true },
] as const

type ColumnId = typeof COLUMNS[number]["id"]

export type AccountingRow = {
  id: string
  concept: string
  date: string
  income: string | null
  expenses: string | null
  category: string | null
  property: string | null
  categorySource: string
  categoryConfidence: number | null
  accountId: string | null
  accountName: string | null
  cashReceiptGenerated: boolean
  paymentProofFileName: string | null
  paymentProofFileUrl: string | null
  facturaFileName: string | null
  facturaFileUrl: string | null
  bankStatementId: string | null
  bankMovementId: string | null
  invoiceId: string | null
  invoiceLabel: string | null
  invoiceNumber: number | null
  cashReceipts: CashReceiptData[]
  expenseVoucher: ExpenseVoucherData | null
}

// Only rows in these categories can generate a cash receipt.
const CASH_RECEIPT_CATEGORIES = new Set(["Pago Administración", "Cuota extraordinaria"])

// Only rows in these categories can generate an expense voucher.
const EXPENSE_VOUCHER_CATEGORIES = new Set(["Egreso"])

// Only rows in these categories can be linked to a cuenta de cobro (contractor invoice).
const INVOICE_LINK_CATEGORIES = new Set(["Egreso", "Retención en la fuente"])

// Only rows in these categories can have the actual bill/invoice document attached.
const FACTURA_CATEGORIES = new Set(["Facturas"])

// Below this confidence, an AI-proposed category/property is flagged for human review.
const AI_REVIEW_THRESHOLD = 0.7

function needsAiReview(r: Pick<AccountingRow, "categorySource" | "categoryConfidence">) {
  return r.categorySource === "ai" && (r.categoryConfidence ?? 0) < AI_REVIEW_THRESHOLD
}

function formatCurrency(value: string | number) {
  return Number(value).toLocaleString("es-CO", { minimumFractionDigits: 2 })
}

function parseLocalDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d)
}

function formatDate(iso: string) {
  return parseLocalDate(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })
}

function isImageFile(fileName: string | null | undefined) {
  return /\.(jpe?g|png)$/i.test(fileName ?? "")
}

type EditingCell = { id: string; field: string; value: string } | null

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: { value: string; label: string; title?: string }[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const toggle = (value: string) => {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }

  return (
    <div ref={ref} className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
        {label}
        {selected.size > 0 && <span className="text-muted-foreground">({selected.size})</span>}
      </Button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-56 overflow-auto rounded-md border bg-popover p-2 shadow-md">
          {options.length > 1 && (
            <div className="flex gap-1 border-b pb-2 mb-1">
              <button
                onClick={() => onChange(new Set(options.map((o) => o.value)))}
                className="flex-1 rounded px-2 py-1 text-xs hover:bg-muted"
              >
                Todas
              </button>
              <button onClick={() => onChange(new Set())} className="flex-1 rounded px-2 py-1 text-xs hover:bg-muted">
                Ninguna
              </button>
            </div>
          )}
          {options.map((opt) => (
            <label
              key={opt.value}
              title={opt.title ?? opt.label}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selected.has(opt.value)}
                onChange={() => toggle(opt.value)}
                className="h-4 w-4 shrink-0"
              />
              <span className="truncate">{opt.label}</span>
            </label>
          ))}
          {options.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Sin opciones</p>}
        </div>
      )}
    </div>
  )
}

export function AccountingTable({ records, units, owners, openInvoices, contractors, accounts }: { records: AccountingRow[]; units: string[]; owners: { unit: string; name: string }[]; openInvoices: OpenInvoiceOption[]; contractors: ContractorData[]; accounts: FinancialAccountData[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState<EditingCell>(null)
  const [receiptModal, setReceiptModal] = useState<CashReceiptData | null>(null)
  const [receiptListRecordId, setReceiptListRecordId] = useState<string | null>(null)
  const [generatingReceiptId, setGeneratingReceiptId] = useState<string | null>(null)
  const [reclassifyingId, setReclassifyingId] = useState<string | null>(null)
  const [bulkGeneratingReceipts, setBulkGeneratingReceipts] = useState(false)
  const [bulkDeletingReceipts, setBulkDeletingReceipts] = useState(false)
  const [voucherModal, setVoucherModal] = useState<ExpenseVoucherData | null>(null)
  const [generateVoucherRecordId, setGenerateVoucherRecordId] = useState<string | null>(null)
  const [linkInvoiceRecord, setLinkInvoiceRecord] = useState<AccountingRow | null>(null)
  const [viewInvoice, setViewInvoice] = useState<InvoiceData | null>(null)
  const [viewInvoiceRecordId, setViewInvoiceRecordId] = useState<string | null>(null)
  const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null)
  const [editRecord, setEditRecord] = useState<AccountingRow | null>(null)
  const [paymentProofTargetId, setPaymentProofTargetId] = useState<string | null>(null)
  const [uploadingProofId, setUploadingProofId] = useState<string | null>(null)
  const [deletingProofId, setDeletingProofId] = useState<string | null>(null)
  const [previewProof, setPreviewProof] = useState<AccountingRow | null>(null)
  const paymentProofInputRef = useRef<HTMLInputElement>(null)
  const [facturaTargetId, setFacturaTargetId] = useState<string | null>(null)
  const [uploadingFacturaId, setUploadingFacturaId] = useState<string | null>(null)
  const [deletingFacturaId, setDeletingFacturaId] = useState<string | null>(null)
  const [previewFactura, setPreviewFactura] = useState<AccountingRow | null>(null)
  const facturaInputRef = useRef<HTMLInputElement>(null)
  const [yearFilter, setYearFilter] = useState<Set<string>>(new Set())
  const [monthFilter, setMonthFilter] = useState<Set<string>>(new Set())
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set())
  const [propertyFilter, setPropertyFilter] = useState<Set<string>>(new Set())
  const [accountFilter, setAccountFilter] = useState<Set<string>>(new Set())
  const [invoiceFilter, setInvoiceFilter] = useState<Set<string>>(new Set())
  const [visibleCols, setVisibleCols] = useState<Set<ColumnId>>(new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id)))
  const [colPickerOpen, setColPickerOpen] = useState(false)
  const colPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!colPickerOpen) return
    const handler = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) {
        setColPickerOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [colPickerOpen])

  const toggleCol = (id: ColumnId) =>
    setVisibleCols((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const col = (id: ColumnId) => visibleCols.has(id)

  // Unique years in chronological order (YYYY key)
  const uniqueYears = Array.from(new Set(records.map((r) => r.date.slice(0, 4))))

  // Unique months in chronological order (YYYY-MM key)
  const uniqueMonths = Array.from(
    new Map(records.map((r) => [
      r.date.slice(0, 7),
      new Date(r.date).toLocaleDateString("es-CO", { month: "long", year: "numeric" }),
    ])).entries()
  )

  const uniqueCategories = Array.from(new Set(records.map((r) => r.category).filter(Boolean) as string[])).sort()
  const uniqueProperties = Array.from(new Set(records.map((r) => r.property).filter(Boolean) as string[])).sort()
  const uniqueAccounts = Array.from(
    new Map(records.filter((r) => r.accountId).map((r) => [r.accountId as string, r.accountName ?? "—"])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]))
  const uniqueInvoices = Array.from(
    new Map(
      records
        .filter((r) => r.invoiceId)
        .map((r) => [
          r.invoiceId as string,
          {
            number: r.invoiceNumber != null ? String(r.invoiceNumber).padStart(4, "0") : "—",
            label: r.invoiceLabel ?? "—",
          },
        ])
    ).entries()
  ).sort((a, b) => a[1].number.localeCompare(b[1].number))

  const filtered = records.filter((r) =>
    (yearFilter.size === 0 || yearFilter.has(r.date.slice(0, 4))) &&
    (monthFilter.size === 0 || monthFilter.has(r.date.slice(0, 7))) &&
    (categoryFilter.size === 0 || categoryFilter.has(r.category ?? "")) &&
    (propertyFilter.size === 0 || propertyFilter.has(r.property ?? "")) &&
    (accountFilter.size === 0 || (r.accountId != null && accountFilter.has(r.accountId))) &&
    (invoiceFilter.size === 0 || (r.invoiceId != null && invoiceFilter.has(r.invoiceId)))
  )

  let runningBalance = 0
  const filteredWithBalance = filtered.map((r) => {
    runningBalance += Number(r.income ?? 0) - Number(r.expenses ?? 0)
    return { ...r, computedBalance: runningBalance.toFixed(2) }
  })

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id))

  const eligibleSelectedForReceiptCount = filteredWithBalance.filter(
    (r) => selected.has(r.id) && CASH_RECEIPT_CATEGORIES.has(r.category ?? "") && r.cashReceipts.length === 0
  ).length

  const selectedReceiptIds = filteredWithBalance
    .filter((r) => selected.has(r.id) && r.cashReceipts.length > 0)
    .flatMap((r) => r.cashReceipts.map((cr) => cr.id))

  const toggleAll = (checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      filtered.forEach((r) => checked ? next.add(r.id) : next.delete(r.id))
      return next
    })

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const handleDelete = (ids: string[]) => {
    startTransition(async () => {
      try {
        await deleteAccountingRecords(ids)
        setSelected((prev) => {
          const next = new Set(prev)
          ids.forEach((id) => next.delete(id))
          return next
        })
        toast.success(ids.length === 1 ? "Registro borrado." : `${ids.length} registros borrados.`)
      } catch {
        toast.error("No se pudieron borrar los registros.")
      }
    })
  }

  const startEdit = (id: string, field: string, value: string) =>
    setEditing({ id, field, value })

  const cancelEdit = () => setEditing(null)

  const commitEdit = () => {
    if (!editing) return
    const snapshot = { ...editing }
    setEditing(null)
    startTransition(async () => {
      await updateAccountingRecord(snapshot.id, snapshot.field, snapshot.value)
    })
  }

  const handleGenerateFirstReceipt = (r: AccountingRow) => {
    setGeneratingReceiptId(r.id)
    startTransition(async () => {
      const result = await generateCashReceipt(r.id)
      setGeneratingReceiptId(null)
      if (result.receipt) {
        setReceiptModal(result.receipt)
        toast.success(`Recibo de caja N° ${String(result.receipt.number).padStart(4, "0")} generado.`)
      } else if (result.error) {
        toast.error(result.error)
      }
    })
  }

  const handleOpenSplit = (accountingRecordId: string) => {
    setReceiptModal(null)
    setReceiptListRecordId(accountingRecordId)
  }

  const handleViewReceiptFromList = (receipt: CashReceiptData) => {
    setReceiptListRecordId(null)
    setReceiptModal(receipt)
  }

  const handleReclassify = (id: string) => {
    setReclassifyingId(id)
    startTransition(async () => {
      const result = await reclassifyRecord(id)
      setReclassifyingId(null)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Registro reclasificado con IA.")
      }
    })
  }

  const handleBulkCashReceipt = () => {
    // Order by table row order (not selection order) so consecutive numbers match what's on screen.
    const orderedIds = filteredWithBalance.filter((r) => selected.has(r.id)).map((r) => r.id)
    setBulkGeneratingReceipts(true)
    startTransition(async () => {
      const result = await generateCashReceiptsBulk(orderedIds)
      setBulkGeneratingReceipts(false)
      if (result.error) {
        toast.error(result.error)
      } else if (result.generated === 0) {
        toast.error("No hay recibos nuevos para generar en la selección.")
      } else {
        toast.success(
          `${result.generated} recibo${result.generated === 1 ? "" : "s"} de caja generado${result.generated === 1 ? "" : "s"}.` +
          (result.skipped ? ` ${result.skipped} omitido${result.skipped === 1 ? "" : "s"}.` : "")
        )
      }
    })
  }

  const handleBulkDeleteCashReceipts = () => {
    const ids = selectedReceiptIds
    if (ids.length === 0) return
    setBulkDeletingReceipts(true)
    startTransition(async () => {
      const result = await deleteCashReceiptsBulk(ids)
      setBulkDeletingReceipts(false)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`${result.deleted} recibo${result.deleted === 1 ? "" : "s"} de caja borrado${result.deleted === 1 ? "" : "s"}.`)
      }
    })
  }

  const handleExpenseVoucherClick = (r: AccountingRow) => {
    if (r.expenseVoucher) {
      setVoucherModal(r.expenseVoucher)
      return
    }
    setGenerateVoucherRecordId(r.id)
  }

  const handleInvoiceLinkClick = (r: AccountingRow) => {
    if (!r.invoiceId) {
      setLinkInvoiceRecord(r)
      return
    }
    setLoadingInvoiceId(r.id)
    startTransition(async () => {
      const inv = await getInvoiceLiveData(r.invoiceId!)
      setLoadingInvoiceId(null)
      if (inv) {
        setViewInvoice(inv)
        setViewInvoiceRecordId(r.id)
      } else {
        toast.error("No se pudo cargar la cuenta de cobro.")
      }
    })
  }

  const handlePaymentProofClick = (r: AccountingRow) => {
    if (r.paymentProofFileUrl) {
      setPreviewProof(r)
      return
    }
    setPaymentProofTargetId(r.id)
    paymentProofInputRef.current?.click()
  }

  const handlePaymentProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const targetId = paymentProofTargetId
    e.target.value = ""
    setPaymentProofTargetId(null)
    if (!file || !targetId) return
    setUploadingProofId(targetId)
    startTransition(async () => {
      const fd = new FormData()
      fd.append("file", file)
      const result = await uploadPaymentProof(targetId, fd)
      setUploadingProofId(null)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Comprobante de pago subido.")
      }
    })
  }

  const handleDeletePaymentProof = (r: AccountingRow) => {
    setDeletingProofId(r.id)
    startTransition(async () => {
      const result = await deletePaymentProof(r.id)
      setDeletingProofId(null)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Comprobante de pago eliminado.")
      }
    })
  }

  const handleFacturaClick = (r: AccountingRow) => {
    if (r.facturaFileUrl) {
      setPreviewFactura(r)
      return
    }
    setFacturaTargetId(r.id)
    facturaInputRef.current?.click()
  }

  const handleFacturaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const targetId = facturaTargetId
    e.target.value = ""
    setFacturaTargetId(null)
    if (!file || !targetId) return
    setUploadingFacturaId(targetId)
    startTransition(async () => {
      const fd = new FormData()
      fd.append("file", file)
      const result = await uploadFactura(targetId, fd)
      setUploadingFacturaId(null)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Factura subida.")
      }
    })
  }

  const handleDeleteFactura = (r: AccountingRow) => {
    setDeletingFacturaId(r.id)
    startTransition(async () => {
      const result = await deleteFactura(r.id)
      setDeletingFacturaId(null)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Factura eliminada.")
      }
    })
  }

  // Render helper — NOT a component, avoids remount/focus loss issues
  const editable = (
    id: string,
    field: string,
    display: React.ReactNode,
    rawValue: string,
    type: "text" | "number" | "date" = "text",
    textRight = false,
  ) => {
    const isEditing = editing?.id === id && editing?.field === field
    if (isEditing) {
      if (type === "number") {
        return (
          <CurrencyInput
            autoFocus
            variant="table"
            value={editing.value}
            onChange={(v) => setEditing({ ...editing, value: v })}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitEdit() }
              if (e.key === "Escape") cancelEdit()
            }}
            className={textRight ? "text-right" : ""}
          />
        )
      }
      return (
        <input
          autoFocus
          type={type}
          value={editing.value}
          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitEdit() }
            if (e.key === "Escape") cancelEdit()
          }}
          className={`w-full bg-transparent outline-none border-b border-primary text-sm${textRight ? " text-right" : ""}`}
        />
      )
    }
    return (
      <span
        onDoubleClick={() => startEdit(id, field, rawValue)}
        title="Doble clic para editar"
        className={`block min-w-[60px] cursor-text${textRight ? " text-right" : ""}`}
      >
        {display}
      </span>
    )
  }

  // Same double-click-to-edit interaction as `editable`, but a <select> instead of a text input —
  // "Cuenta" is a FK to FinancialAccount now, not free text.
  const accountCell = (r: AccountingRow) => {
    const isEditing = editing?.id === r.id && editing?.field === "accountId"
    if (isEditing) {
      return (
        <select
          autoFocus
          value={editing.value}
          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitEdit() }
            if (e.key === "Escape") cancelEdit()
          }}
          className="w-full bg-transparent outline-none border-b border-primary text-sm"
        >
          <option value="">— Sin cuenta —</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      )
    }
    return (
      <span
        onDoubleClick={() => startEdit(r.id, "accountId", r.accountId ?? "")}
        title="Doble clic para editar"
        className="block min-w-[60px] cursor-text"
      >
        {r.accountName ?? "—"}
      </span>
    )
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <p className="text-muted-foreground">Aún no hay registros contables.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 gap-3">
      <p className="-mt-2 text-sm text-muted-foreground">
        {filtered.length === records.length ? (
          <>{records.length} {records.length === 1 ? "registro" : "registros"}</>
        ) : (
          <>
            <span className="font-medium text-foreground">{filtered.length}</span> de {records.length}{" "}
            {records.length === 1 ? "registro" : "registros"}
          </>
        )}
      </p>
      <input
        ref={paymentProofInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={handlePaymentProofFileChange}
      />
      <input
        ref={facturaInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={handleFacturaFileChange}
      />
      <div className="flex items-center gap-3">
        <MultiSelectFilter
          label="Año"
          options={uniqueYears.map((y) => ({ value: y, label: y }))}
          selected={yearFilter}
          onChange={(next) => { setYearFilter(next); setSelected(new Set()) }}
        />
        <MultiSelectFilter
          label="Mes"
          options={uniqueMonths.map(([key, label]) => ({ value: key, label }))}
          selected={monthFilter}
          onChange={(next) => { setMonthFilter(next); setSelected(new Set()) }}
        />
        <MultiSelectFilter
          label="Categoría"
          options={uniqueCategories.map((c) => ({ value: c, label: c }))}
          selected={categoryFilter}
          onChange={(next) => { setCategoryFilter(next); setSelected(new Set()) }}
        />
        <MultiSelectFilter
          label="Propiedad"
          options={uniqueProperties.map((p) => ({ value: p, label: p }))}
          selected={propertyFilter}
          onChange={(next) => { setPropertyFilter(next); setSelected(new Set()) }}
        />
        <MultiSelectFilter
          label="Cuenta"
          options={uniqueAccounts.map(([id, name]) => ({ value: id, label: name }))}
          selected={accountFilter}
          onChange={(next) => { setAccountFilter(next); setSelected(new Set()) }}
        />
        <MultiSelectFilter
          label="Cuenta de Cobro"
          options={uniqueInvoices.map(([id, { number, label }]) => ({ value: id, label: number, title: label }))}
          selected={invoiceFilter}
          onChange={(next) => { setInvoiceFilter(next); setSelected(new Set()) }}
        />
        <div ref={colPickerRef} className="relative ml-auto">
          <Button variant="outline" size="sm" onClick={() => setColPickerOpen((o) => !o)}>
            <Columns3 className="h-4 w-4" />
            Columnas
          </Button>
          {colPickerOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border bg-popover p-2 shadow-md">
              <div className="flex gap-1 border-b pb-2 mb-1">
                <button
                  onClick={() => setVisibleCols(new Set(COLUMNS.map((c) => c.id)))}
                  className="flex-1 rounded px-2 py-1 text-xs hover:bg-muted"
                >
                  Todas
                </button>
                <button
                  onClick={() => setVisibleCols(new Set())}
                  className="flex-1 rounded px-2 py-1 text-xs hover:bg-muted"
                >
                  Ninguna
                </button>
              </div>
              {COLUMNS.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={visibleCols.has(c.id)}
                    onChange={() => toggleCol(c.id)}
                    className="h-4 w-4"
                  />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b bg-muted text-muted-foreground">
              <th className="px-4 py-3">
                <input type="checkbox" checked={allSelected} onChange={(e) => toggleAll(e.target.checked)} className="h-4 w-4 cursor-pointer" />
              </th>
              {col("date")           && <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Fecha</th>}
              {col("account")        && <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Cuenta</th>}
              {col("movement")       && <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Movimiento</th>}
              {col("concept")        && <th className="px-4 py-3 text-left font-medium whitespace-nowrap min-w-[23.4rem]">Concepto</th>}
              {col("income")         && <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Ingreso</th>}
              {col("expenses")       && <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Egreso</th>}
              {col("balance")        && <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Balance</th>}
              {col("category")       && <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Categoría</th>}
              {col("property")       && <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Propiedad</th>}
              {col("cashReceipt")    && <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Recibo de Caja</th>}
              {col("expenseVoucher") && <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Comprobante Egreso</th>}
              {col("invoiceLink")    && <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Cuenta de Cobro</th>}
              <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredWithBalance.map((r) => {
                return (
                  <tr key={r.id} className={`border-b last:border-0 hover:bg-muted/30 ${selected.has(r.id) ? "bg-muted/20" : ""}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4 cursor-pointer" />
                    </td>
                    {col("date") && (
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {editable(r.id, "date", formatDate(r.date), r.date.slice(0, 10), "date")}
                      </td>
                    )}
                    {col("account") && (
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {accountCell(r)}
                      </td>
                    )}
                    {col("movement") && (
                      <td className="px-4 py-3 font-mono text-xs">
                        {r.bankMovementId && r.bankStatementId ? (
                          <a
                            href={`/bank-statements/${r.bankStatementId}`}
                            className="text-blue-600 hover:underline"
                            title={r.bankMovementId}
                          >
                            {r.bankMovementId.slice(-8)}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                    {col("concept") && (
                      <td className="px-4 py-3 min-w-[23.4rem]">
                        {editable(r.id, "concept", r.concept, r.concept)}
                      </td>
                    )}
                    {col("income") && (
                      <td className="px-4 py-3 text-right text-green-600">
                        {editable(r.id, "income", r.income != null ? formatCurrency(r.income) : "—", r.income ?? "", "number", true)}
                      </td>
                    )}
                    {col("expenses") && (
                      <td className="px-4 py-3 text-right text-red-600">
                        {editable(r.id, "expenses", r.expenses != null ? formatCurrency(r.expenses) : "—", r.expenses ?? "", "number", true)}
                      </td>
                    )}
                    {col("balance") && (
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {formatCurrency(r.computedBalance)}
                      </td>
                    )}
                    {col("category") && (
                      <td className={`px-4 py-3${needsAiReview(r) ? " bg-amber-50 dark:bg-amber-950/30 ring-1 ring-inset ring-amber-300 dark:ring-amber-700" : ""}`}>
                        <CategoryCombobox
                          value={r.category ?? ""}
                          onChange={(val) => startTransition(async () => { await updateAccountingRecord(r.id, "category", val) })}
                          variant="table"
                        />
                      </td>
                    )}
                    {col("property") && (
                      <td className={`px-4 py-3${(CASH_RECEIPT_CATEGORIES.has(r.category ?? "") && !r.property) || needsAiReview(r) ? " bg-amber-50 dark:bg-amber-950/30 ring-1 ring-inset ring-amber-300 dark:ring-amber-700" : ""}`}>
                        <CategoryCombobox
                          value={r.property ?? ""}
                          onChange={(val) => startTransition(async () => { await updateAccountingRecord(r.id, "property", val) })}
                          variant="table"
                          options={units}
                        />
                      </td>
                    )}
                    {col("cashReceipt") && (
                      <td className={`px-4 py-3 text-center${CASH_RECEIPT_CATEGORIES.has(r.category ?? "") && r.cashReceipts.length === 0 ? " bg-amber-50 dark:bg-amber-950/30 ring-1 ring-inset ring-amber-300 dark:ring-amber-700" : ""}`}>
                        {CASH_RECEIPT_CATEGORIES.has(r.category ?? "") && (
                          r.cashReceipts.length === 0 ? (
                            <button
                              onClick={() => handleGenerateFirstReceipt(r)}
                              disabled={generatingReceiptId === r.id}
                              title="Generar recibo de caja"
                              className="mx-auto flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {generatingReceiptId === r.id
                                ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                : <FileText className="h-4 w-4 text-muted-foreground hover:text-foreground" />}
                            </button>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              {r.cashReceipts.map((cr) => (
                                <button
                                  key={cr.id}
                                  onClick={() => setReceiptModal(cr)}
                                  title="Ver recibo de caja"
                                  className="flex items-center justify-center gap-1.5"
                                >
                                  <Eye className="h-4 w-4 text-blue-600 hover:text-blue-700" />
                                  <span className="font-mono text-xs text-blue-700 dark:text-blue-300">
                                    {String(cr.number).padStart(4, "0")}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )
                        )}
                      </td>
                    )}
                    {col("expenseVoucher") && (
                      <td className={`px-4 py-3 text-center${EXPENSE_VOUCHER_CATEGORIES.has(r.category ?? "") && !r.expenseVoucher ? " bg-amber-50 dark:bg-amber-950/30 ring-1 ring-inset ring-amber-300 dark:ring-amber-700" : ""}`}>
                        {EXPENSE_VOUCHER_CATEGORIES.has(r.category ?? "") && (
                          <button
                            onClick={() => handleExpenseVoucherClick(r)}
                            title={r.expenseVoucher ? "Ver comprobante de egreso" : "Generar comprobante de egreso"}
                            className="mx-auto flex items-center justify-center gap-1.5"
                          >
                            {r.expenseVoucher
                              ? <Eye className="h-4 w-4 text-blue-600 hover:text-blue-700" />
                              : <FileText className="h-4 w-4 text-muted-foreground hover:text-foreground" />}
                            {r.expenseVoucher && (
                              <span className="font-mono text-xs text-blue-700 dark:text-blue-300">
                                {String(r.expenseVoucher.number).padStart(4, "0")}
                              </span>
                            )}
                          </button>
                        )}
                      </td>
                    )}
                    {col("invoiceLink") && (
                      <td className={`px-4 py-3 text-center${INVOICE_LINK_CATEGORIES.has(r.category ?? "") && !r.invoiceId ? " bg-amber-50 dark:bg-amber-950/30 ring-1 ring-inset ring-amber-300 dark:ring-amber-700" : ""}`}>
                        {INVOICE_LINK_CATEGORIES.has(r.category ?? "") && (
                          <button
                            onClick={() => handleInvoiceLinkClick(r)}
                            disabled={loadingInvoiceId === r.id}
                            title={r.invoiceId ? `Ver cuenta de cobro: ${r.invoiceLabel ?? ""}` : "Ligar a una cuenta de cobro"}
                            className="mx-auto flex items-center justify-center gap-1.5 disabled:opacity-50"
                          >
                            {loadingInvoiceId === r.id
                              ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              : r.invoiceId
                                ? <Eye className="h-4 w-4 text-blue-600 hover:text-blue-700" />
                                : <FileText className="h-4 w-4 text-muted-foreground hover:text-foreground" />}
                            {r.invoiceId && r.invoiceNumber != null && (
                              <span className="font-mono text-xs text-blue-700 dark:text-blue-300">
                                {String(r.invoiceNumber).padStart(4, "0")}
                              </span>
                            )}
                          </button>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditRecord(r)}
                          className="text-muted-foreground hover:text-primary"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {EXPENSE_VOUCHER_CATEGORIES.has(r.category ?? "") && (
                          <>
                            <button
                              onClick={() => handlePaymentProofClick(r)}
                              disabled={uploadingProofId === r.id}
                              className={`disabled:opacity-50 ${r.paymentProofFileUrl ? "text-blue-600 hover:text-blue-700" : "text-muted-foreground hover:text-primary"}`}
                              title={r.paymentProofFileUrl ? `Ver comprobante de pago: ${r.paymentProofFileName ?? ""}` : "Adjuntar comprobante de pago"}
                            >
                              {uploadingProofId === r.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Paperclip className="h-4 w-4" />}
                            </button>
                            {r.paymentProofFileUrl && (
                              <button
                                onClick={() => handleDeletePaymentProof(r)}
                                disabled={deletingProofId === r.id}
                                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                                title="Quitar comprobante de pago"
                              >
                                {deletingProofId === r.id
                                  ? <Loader2 className="h-4 w-4 animate-spin" />
                                  : <X className="h-4 w-4" />}
                              </button>
                            )}
                          </>
                        )}
                        {FACTURA_CATEGORIES.has(r.category ?? "") && (
                          <>
                            <button
                              onClick={() => handleFacturaClick(r)}
                              disabled={uploadingFacturaId === r.id}
                              className={`disabled:opacity-50 ${r.facturaFileUrl ? "text-blue-600 hover:text-blue-700" : "text-muted-foreground hover:text-primary"}`}
                              title={r.facturaFileUrl ? `Ver factura: ${r.facturaFileName ?? ""}` : "Adjuntar factura"}
                            >
                              {uploadingFacturaId === r.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Paperclip className="h-4 w-4" />}
                            </button>
                            {r.facturaFileUrl && (
                              <button
                                onClick={() => handleDeleteFactura(r)}
                                disabled={deletingFacturaId === r.id}
                                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                                title="Quitar factura"
                              >
                                {deletingFacturaId === r.id
                                  ? <Loader2 className="h-4 w-4 animate-spin" />
                                  : <X className="h-4 w-4" />}
                              </button>
                            )}
                          </>
                        )}
                        <button
                          onClick={() => handleReclassify(r.id)}
                          disabled={reclassifyingId === r.id}
                          className={`disabled:opacity-50 ${needsAiReview(r) ? "text-amber-600 hover:text-amber-700" : "text-muted-foreground hover:text-primary"}`}
                          title={
                            r.categorySource === "ai" && r.categoryConfidence != null
                              ? `Reclasificar con IA (confianza actual ${(r.categoryConfidence * 100).toFixed(0)}%)`
                              : "Reclasificar con IA"
                          }
                        >
                          {reclassifyingId === r.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Sparkles className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => handleDelete([r.id])}
                          disabled={isPending}
                          className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                          title="Eliminar"
                        >
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

      {selected.size > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{selected.size} seleccionados</span>
          {eligibleSelectedForReceiptCount > 0 && (
            <Button variant="outline" size="sm" disabled={bulkGeneratingReceipts} onClick={handleBulkCashReceipt}>
              {bulkGeneratingReceipts
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <FileText className="h-4 w-4" />}
              Generar recibos de caja ({eligibleSelectedForReceiptCount})
            </Button>
          )}
          {selectedReceiptIds.length > 0 && (
            <Button variant="outline" size="sm" disabled={bulkDeletingReceipts} onClick={handleBulkDeleteCashReceipts}>
              {bulkDeletingReceipts
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Trash2 className="h-4 w-4" />}
              Borrar recibos de caja ({selectedReceiptIds.length})
            </Button>
          )}
          <Button variant="destructive" size="sm" disabled={isPending} onClick={() => handleDelete([...selected])}>
            <Trash2 className="h-4 w-4" />
            Eliminar seleccionados
          </Button>
        </div>
      )}

      <EditRecordDialog
        record={editRecord}
        units={units}
        accounts={accounts}
        open={editRecord !== null}
        onClose={() => setEditRecord(null)}
      />

      <CashReceiptModal
        receipt={receiptModal}
        open={receiptModal !== null}
        onClose={() => setReceiptModal(null)}
        onDeleted={() => setReceiptModal(null)}
        onOpenSplit={handleOpenSplit}
        owners={owners}
      />

      <CashReceiptsListModal
        accountingRecordId={receiptListRecordId}
        open={receiptListRecordId !== null}
        onClose={() => setReceiptListRecordId(null)}
        onViewReceipt={handleViewReceiptFromList}
      />

      <ExpenseVoucherModal
        voucher={voucherModal}
        open={voucherModal !== null}
        onClose={() => setVoucherModal(null)}
        onDeleted={() => setVoucherModal(null)}
        contractors={contractors}
        accounts={accounts}
      />

      <InvoiceDocumentModal
        invoice={viewInvoice}
        open={viewInvoice !== null}
        onClose={() => { setViewInvoice(null); setViewInvoiceRecordId(null) }}
        onDeleted={() => { setViewInvoice(null); setViewInvoiceRecordId(null) }}
        contractors={contractors}
        linkedAccountingRecordId={viewInvoiceRecordId}
      />

      <GenerateExpenseVoucherDialog
        recordId={generateVoucherRecordId}
        recordAmount={(() => {
          const r = records.find((x) => x.id === generateVoucherRecordId)
          return r ? Number(r.expenses ?? r.income ?? 0) : undefined
        })()}
        recordInvoiceLabel={records.find((x) => x.id === generateVoucherRecordId)?.invoiceLabel ?? null}
        open={generateVoucherRecordId !== null}
        onClose={() => setGenerateVoucherRecordId(null)}
        onGenerated={(v) => { setGenerateVoucherRecordId(null); setVoucherModal(v) }}
      />

      <LinkInvoiceDialog
        record={linkInvoiceRecord}
        openInvoices={openInvoices}
        open={linkInvoiceRecord !== null}
        onClose={() => setLinkInvoiceRecord(null)}
      />

      <Dialog open={previewProof !== null} onOpenChange={(v) => { if (!v) setPreviewProof(null) }}>
        <DialogContent className="w-full max-w-4xl gap-0 p-0">
          <div className="flex items-center justify-between border-b py-2 pl-4 pr-12">
            <DialogTitle className="text-sm font-medium">
              Comprobante de pago — {previewProof?.paymentProofFileName ?? ""}
            </DialogTitle>
            {previewProof && (
              <a href={`/api/accounting/${previewProof.id}/payment-proof`} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium hover:bg-muted">
                <Download className="h-3.5 w-3.5" /> Descargar
              </a>
            )}
          </div>
          <DialogDescription className="sr-only">Previsualización del comprobante de pago</DialogDescription>
          {previewProof && (
            isImageFile(previewProof.paymentProofFileName) ? (
              <div className="flex h-[80vh] w-full items-center justify-center overflow-auto bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/accounting/${previewProof.id}/payment-proof`}
                  alt="Comprobante de pago"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : (
              <iframe src={`/api/accounting/${previewProof.id}/payment-proof`} title="Comprobante de pago" className="h-[80vh] w-full" />
            )
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={previewFactura !== null} onOpenChange={(v) => { if (!v) setPreviewFactura(null) }}>
        <DialogContent className="w-full max-w-4xl gap-0 p-0">
          <div className="flex items-center justify-between border-b py-2 pl-4 pr-12">
            <DialogTitle className="text-sm font-medium">
              Factura — {previewFactura?.facturaFileName ?? ""}
            </DialogTitle>
            {previewFactura && (
              <a href={`/api/accounting/${previewFactura.id}/factura`} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium hover:bg-muted">
                <Download className="h-3.5 w-3.5" /> Descargar
              </a>
            )}
          </div>
          <DialogDescription className="sr-only">Previsualización de la factura</DialogDescription>
          {previewFactura && (
            isImageFile(previewFactura.facturaFileName) ? (
              <div className="flex h-[80vh] w-full items-center justify-center overflow-auto bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/accounting/${previewFactura.id}/factura`}
                  alt="Factura"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : (
              <iframe src={`/api/accounting/${previewFactura.id}/factura`} title="Factura" className="h-[80vh] w-full" />
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
