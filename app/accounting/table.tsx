"use client"

import { Fragment, useState, useTransition, useRef, useEffect } from "react"
import { toast } from "sonner"
import { deleteAccountingRecords, updateAccountingRecord, reclassifyRecord, generateCashReceipt, generateCashReceiptsBulk, deleteCashReceiptsBulk, uploadFactura, deleteFactura } from "./actions"
import type { CashReceiptData, ExpenseVoucherData, PaymentProofRow } from "./actions"
import { PaymentProofsDialog } from "./payment-proofs-dialog"
import { getInvoiceLiveData, type OpenInvoiceOption, type InvoiceData } from "../invoices/actions"
import type { ContractorData } from "../contractors/actions"
import type { FinancialAccountData } from "../accounts/actions"
import { Button } from "@/components/ui/button"
import { CategoryCombobox } from "@/components/ui/category-combobox"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { MultiSelectFilter } from "@/components/ui/multi-select-filter"
import { CashReceiptModal } from "./cash-receipt-modal"
import { ExpenseVoucherModal } from "./expense-voucher-modal"
import { GenerateExpenseVoucherDialog } from "./generate-voucher-dialog"
import { LinkInvoiceDialog } from "./link-invoice-dialog"
import { InvoiceDocumentModal } from "../invoices/invoice-document-modal"
import { EditRecordDialog } from "./edit-record-dialog"
import { AddChildRecordRow } from "./add-child-record-row"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Columns3, ChevronRight, ChevronDown, Download, Eye, FileText, ListPlus, Loader2, Lock, LockOpen, MoreHorizontal, Paperclip, Pencil, Sparkles, Trash2, X } from "lucide-react"

const COLUMNS = [
  { id: "id",             label: "ID",                  defaultVisible: false },
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
  paymentProofs: PaymentProofRow[]
  facturaFileName: string | null
  facturaFileUrl: string | null
  bankStatementId: string | null
  bankMovementId: string | null
  parentRecordId: string | null
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

// Only rows in these categories can have a comprobante de pago (uploaded proof of payment)
// attached — broader than EXPENSE_VOUCHER_CATEGORIES: a Retención en la fuente never gets its
// own "Comprobante de Egreso" PDF, but it's still a real payment that can have a proof attached.
const PAYMENT_PROOF_CATEGORIES = new Set(["Egreso", "Retención en la fuente"])

// Only rows in these categories can be linked to a cuenta de cobro (contractor invoice).
const INVOICE_LINK_CATEGORIES = new Set(["Egreso", "Retención en la fuente"])

// Only rows in these categories can have the actual bill/invoice document attached.
const FACTURA_CATEGORIES = new Set(["Facturas"])

// Only rows in these categories can be broken down into the Egresos that explain the cash.
const CASH_WITHDRAWAL_CATEGORIES = new Set(["Retiro en Efectivo"])

// Categories that can be broken down into expense-type children at all — beyond a cash
// withdrawal, a plain "Egreso" can bundle several purchases, and a "Retención en la fuente" can
// cover several different cuentas de cobro, each needing its own piece to link separately.
const EXPENSE_BREAKDOWN_CATEGORIES = new Set(["Retiro en Efectivo", "Egreso", "Retención en la fuente"])

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

export function AccountingTable({ records, units, owners, openInvoices, contractors, accounts }: { records: AccountingRow[]; units: string[]; owners: { unit: string; name: string }[]; openInvoices: OpenInvoiceOption[]; contractors: ContractorData[]; accounts: FinancialAccountData[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchorRowId, setAnchorRowId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState<EditingCell>(null)
  const [receiptModal, setReceiptModal] = useState<CashReceiptData | null>(null)
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
  const [expandedParentIds, setExpandedWithdrawalIds] = useState<Set<string>>(new Set())
  const [proofsRecordId, setProofsRecordId] = useState<string | null>(null)
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

  // Real running balance across the full, unfiltered ledger (deterministic date/createdAt order
  // from the server) — precomputed once so a locked anchor's balance never depends on the filter.
  // Child records (parentRecordId set — Egresos explaining a Retiro en Efectivo, or split
  // payments) don't move the balance again — the parent itself already counted once.
  let trueRunning = 0
  const recordsWithTrueBalance = records.map((r, i) => {
    if (r.parentRecordId == null) {
      trueRunning += Number(r.income ?? 0) - Number(r.expenses ?? 0)
    }
    return { ...r, trueBalance: trueRunning, originalIndex: i }
  })
  const anchorIndex = anchorRowId ? recordsWithTrueBalance.findIndex((r) => r.id === anchorRowId) : -1
  const anchorBalance = anchorIndex >= 0 ? recordsWithTrueBalance[anchorIndex].trueBalance : 0

  // Group child records by their parent's id, so they can be rendered nested under it instead
  // of as independent top-level rows.
  const childrenByParentId = new Map<string, typeof recordsWithTrueBalance>()
  for (const r of recordsWithTrueBalance) {
    if (!r.parentRecordId) continue
    const list = childrenByParentId.get(r.parentRecordId) ?? []
    list.push(r)
    childrenByParentId.set(r.parentRecordId, list)
  }

  const matchesFilters = (r: (typeof recordsWithTrueBalance)[number]) =>
    (yearFilter.size === 0 || yearFilter.has(r.date.slice(0, 4))) &&
    (monthFilter.size === 0 || monthFilter.has(r.date.slice(0, 7))) &&
    (categoryFilter.size === 0 || categoryFilter.has(r.category ?? "")) &&
    (propertyFilter.size === 0 || propertyFilter.has(r.property ?? "")) &&
    (accountFilter.size === 0 || (r.accountId != null && accountFilter.has(r.accountId))) &&
    (invoiceFilter.size === 0 || (r.invoiceId != null && invoiceFilter.has(r.invoiceId)))

  const hasActiveFilters =
    yearFilter.size > 0 ||
    monthFilter.size > 0 ||
    categoryFilter.size > 0 ||
    propertyFilter.size > 0 ||
    accountFilter.size > 0 ||
    invoiceFilter.size > 0

  // The anchored row always stays visible — even if the active filters would otherwise hide
  // it — since it's the reference point the balance calculation is pinned to. A parent whose
  // own fields don't match the filters (e.g. a "Retiro en Efectivo" while filtering by the
  // "Egreso" category) still needs to show up whenever one of its children does match — the
  // child can only be rendered nested under its parent, never as its own top-level row.
  const filtered = recordsWithTrueBalance.filter((r) =>
    r.id === anchorRowId ||
    (
      r.parentRecordId == null && // rendered nested under its parent instead of top-level
      (matchesFilters(r) || (childrenByParentId.get(r.id) ?? []).some(matchesFilters))
    )
  )

  // A parent pulled into view only because one of its children matched the filters (not
  // because it matched itself) needs to start expanded — otherwise the matching child stays
  // hidden behind the collapsed arrow and the filter would look like it found nothing.
  const forceExpandParentIds = new Set<string>()
  if (hasActiveFilters) {
    for (const r of filtered) {
      if (r.parentRecordId != null || matchesFilters(r)) continue
      if ((childrenByParentId.get(r.id) ?? []).some(matchesFilters)) forceExpandParentIds.add(r.id)
    }
  }

  // With no anchor, balance is the sum of the filtered subset starting at zero (previous
  // behavior). With an anchor, it starts at the anchor's real balance and only accumulates
  // forward — rows before the anchor (in ledger order) have no defined balance relative to it.
  let runningBalance = anchorIndex >= 0 ? anchorBalance : 0
  const filteredWithBalance = filtered.map((r) => {
    if (anchorIndex >= 0 && r.originalIndex < anchorIndex) {
      return { ...r, computedBalance: null as string | null }
    }
    if (anchorIndex >= 0 && r.originalIndex === anchorIndex) {
      return { ...r, computedBalance: anchorBalance.toFixed(2) as string | null }
    }
    if (r.parentRecordId == null) {
      runningBalance += Number(r.income ?? 0) - Number(r.expenses ?? 0)
    }
    return { ...r, computedBalance: runningBalance.toFixed(2) as string | null }
  })

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id))

  // checkbox col + expand-chevron col + visible data cols + Acciones col — used as the
  // colSpan for the nested child-record row so it spans the full table width.
  const visibleColumnCount = 2 + COLUMNS.filter((c) => col(c.id)).length + 1

  const eligibleSelectedForReceiptCount = filteredWithBalance.filter(
    (r) => selected.has(r.id) && CASH_RECEIPT_CATEGORIES.has(r.category ?? "") && r.cashReceipts.length === 0
  ).length

  const selectedReceiptIds = filteredWithBalance
    .filter((r) => selected.has(r.id) && r.cashReceipts.length > 0)
    .flatMap((r) => r.cashReceipts.map((cr) => cr.id))

  const toggleAll = (checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      filtered.forEach((r) => {
        checked ? next.add(r.id) : next.delete(r.id)
        ;(childrenByParentId.get(r.id) ?? []).forEach((c) => (checked ? next.add(c.id) : next.delete(c.id)))
      })
      return next
    })

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      const willSelect = !next.has(id)
      willSelect ? next.add(id) : next.delete(id)
      // Selecting/deselecting a parent row carries its children along with it.
      ;(childrenByParentId.get(id) ?? []).forEach((c) => (willSelect ? next.add(c.id) : next.delete(c.id)))
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
        setAnchorRowId((prev) => (prev && ids.includes(prev) ? null : prev))
        toast.success(ids.length === 1 ? "Registro borrado." : `${ids.length} registros borrados.`)
      } catch {
        toast.error("No se pudieron borrar los registros.")
      }
    })
  }

  const toggleAnchor = (id: string) => setAnchorRowId((prev) => (prev === id ? null : id))

  const toggleExpanded = (id: string) =>
    setExpandedWithdrawalIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const startEdit = (id: string, field: string, value: string) =>
    setEditing({ id, field, value })

  const cancelEdit = () => setEditing(null)

  const commitEdit = () => {
    if (!editing) return
    const snapshot = { ...editing }
    setEditing(null)
    startTransition(async () => {
      const result = await updateAccountingRecord(snapshot.id, snapshot.field, snapshot.value)
      if (result.error) toast.error(result.error)
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

  // Shared by top-level rows and the rows nested under a parent (Egresos explaining a "Retiro en
  // Efectivo", or split payments under a "Pago Administración"/"Cuota extraordinaria") — a nested
  // row is a real AccountingRecord rendered with the exact same columns/actions, just indented
  // and tinted to read as a child of the parent above it.
  const renderRow = (r: AccountingRow & { computedBalance: string | null }, nested: boolean, isLastInGroup = false) => {
    const isWithdrawal = CASH_WITHDRAWAL_CATEGORIES.has(r.category ?? "")
    // A plain "Egreso" or "Retención en la fuente" can be broken down too, same mechanism as a
    // cash withdrawal — but neither gets the "must eventually be justified" nudge below, since
    // (unlike cash pulled out of the bank) they're already fully documented on their own and
    // breaking them down further is optional, not an obligation.
    const canBreakdownAsExpense = EXPENSE_BREAKDOWN_CATEGORIES.has(r.category ?? "")
    const isSplittablePayment = CASH_RECEIPT_CATEGORIES.has(r.category ?? "")
    const isExpanded = expandedParentIds.has(r.id) || forceExpandParentIds.has(r.id)
    const children = childrenByParentId.get(r.id) ?? []
    const hasChildren = children.length > 0
    // Nested rows never get their own expand arrow — no second level of nesting, even though a
    // split-payment child inherits its parent's category (which would otherwise also qualify).
    // In its natural state a record has no desglose, so the arrow only shows up once one exists
    // — before that, "Agregar desglose" in the Acciones dropdown is what starts it.
    const canExpand = !nested && hasChildren && (canBreakdownAsExpense || isSplittablePayment)
    // Offered while there's nothing to break down yet; once a desglose exists, the arrow takes over.
    const canStartBreakdown = !nested && !hasChildren && (canBreakdownAsExpense || isSplittablePayment)
    // Split-payment children (as opposed to Egreso children of a withdrawal) inherit category
    // and property from their parent at creation time — lock them here so they can't drift.
    const isIncomeChild = nested && r.income != null
    // Once a parent has started being explained/split, flag it while its children's amounts
    // still fall short of the parent's own — same "needs action" convention as the other
    // amber-highlighted columns in this table.
    const pendingAmount = Number(r.income ?? r.expenses ?? 0) - children.reduce((sum, c) => sum + Number(c.income ?? c.expenses ?? 0), 0)
    const needsMoreChildren = hasChildren && pendingAmount > 0
    // Unlike needsMoreChildren (which requires the desglose to have already started), this also
    // covers a withdrawal that was never broken down at all — both are "not yet justified".
    const needsJustification = !nested && isWithdrawal && pendingAmount > 0
    // The expanded parent and its children read as one visual group, boxed in with a colored
    // bracket (top edge on the parent, left edge running down every row, bottom edge closed off
    // by AddChildRecordRow) instead of the barely-there muted tint this started with — the
    // parent gets a stronger fill than its children so it still reads as the "header" of the group.
    const isExpandedParent = !nested && isExpanded && hasChildren
    const inGroup = nested || isExpandedParent
    const groupBorder = "border-slate-400 dark:border-slate-500"
    return (
      <tr id={`record-${r.id}`} key={r.id} className={`border-b last:border-0 hover:bg-muted/30 target:bg-blue-100 dark:target:bg-blue-950/40 ${nested ? "bg-slate-50 dark:bg-slate-800/30" : ""} ${isExpandedParent ? `bg-slate-100 dark:bg-slate-800/60 border-t-2 ${groupBorder}` : ""} ${isLastInGroup ? `border-b-2 ${groupBorder}` : ""} ${selected.has(r.id) ? "bg-muted/20" : ""} ${r.id === anchorRowId ? "bg-blue-50 dark:bg-blue-950/20" : ""} ${needsMoreChildren ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}>
        <td className={`px-4 py-3${inGroup ? ` border-l-4 ${groupBorder}` : ""}`}>
          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4 cursor-pointer" />
        </td>
        <td className={`px-0 py-3${needsMoreChildren ? " bg-amber-50 dark:bg-amber-950/30 ring-1 ring-inset ring-amber-300 dark:ring-amber-700" : ""}`}>
          {canExpand && (
            <button
              onClick={() => toggleExpanded(r.id)}
              title={
                needsMoreChildren
                  ? `Faltan $${pendingAmount.toLocaleString("es-CO")} por explicar`
                  : isExpanded ? "Ocultar el desglose" : "Ver/agregar el desglose de este registro"
              }
              className="text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
        </td>
        {col("id") && (
          <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap" title={r.id}>
            {r.id.slice(-8)}
          </td>
        )}
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
            {r.bankStatementId ? (
              <a
                href={`/bank-statements/${r.bankStatementId}`}
                className="text-blue-600 hover:underline"
                title={r.bankMovementId ?? undefined}
              >
                {r.bankMovementId ? r.bankMovementId.slice(-8) : "Ver extracto"}
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
            {r.computedBalance != null && !hasChildren ? formatCurrency(r.computedBalance) : <span className="text-muted-foreground">—</span>}
          </td>
        )}
        {col("category") && (
          <td className={`px-4 py-3${needsAiReview(r) ? " bg-amber-50 dark:bg-amber-950/30 ring-1 ring-inset ring-amber-300 dark:ring-amber-700" : ""}`}>
            <div className="flex items-center gap-1.5">
              <div className={needsJustification ? "underline decoration-amber-500 dark:decoration-amber-600" : ""}>
                <CategoryCombobox
                  value={r.category ?? ""}
                  onChange={(val) => startTransition(async () => { await updateAccountingRecord(r.id, "category", val) })}
                  variant="table"
                  disabled={isIncomeChild}
                />
              </div>
              {needsJustification && (
                <button
                  onClick={() => toggleExpanded(r.id)}
                  title={hasChildren ? `Faltan $${pendingAmount.toLocaleString("es-CO")} por explicar` : "Este retiro aún no tiene desglose — clic para agregarlo"}
                  className="text-amber-600 hover:text-amber-700 dark:text-amber-500"
                >
                  <ListPlus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </td>
        )}
        {col("property") && (
          <td className={`px-4 py-3${(CASH_RECEIPT_CATEGORIES.has(r.category ?? "") && !r.property) || needsAiReview(r) ? " bg-amber-50 dark:bg-amber-950/30 ring-1 ring-inset ring-amber-300 dark:ring-amber-700" : ""}`}>
            <CategoryCombobox
              value={r.property ?? ""}
              onChange={(val) => startTransition(async () => { await updateAccountingRecord(r.id, "property", val) })}
              variant="table"
              options={units}
              disabled={isIncomeChild}
            />
          </td>
        )}
        {col("cashReceipt") && (
          <td className={`px-4 py-3 text-center${CASH_RECEIPT_CATEGORIES.has(r.category ?? "") && !hasChildren && r.cashReceipts.length === 0 ? " bg-amber-50 dark:bg-amber-950/30 ring-1 ring-inset ring-amber-300 dark:ring-amber-700" : ""}`}>
            {CASH_RECEIPT_CATEGORIES.has(r.category ?? "") && !hasChildren && (
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
          <td className={`px-4 py-3 text-center${EXPENSE_VOUCHER_CATEGORIES.has(r.category ?? "") && !hasChildren && !r.expenseVoucher ? " bg-amber-50 dark:bg-amber-950/30 ring-1 ring-inset ring-amber-300 dark:ring-amber-700" : ""}`}>
            {EXPENSE_VOUCHER_CATEGORIES.has(r.category ?? "") && !hasChildren && (
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
          <td className={`px-4 py-3 text-center${INVOICE_LINK_CATEGORIES.has(r.category ?? "") && !r.invoiceId && !hasChildren ? " bg-amber-50 dark:bg-amber-950/30 ring-1 ring-inset ring-amber-300 dark:ring-amber-700" : ""}`}>
            {INVOICE_LINK_CATEGORIES.has(r.category ?? "") && !hasChildren && (
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-muted-foreground hover:text-primary" title="Acciones">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => toggleAnchor(r.id)}>
                {r.id === anchorRowId ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                {r.id === anchorRowId ? "Quitar punto de partida" : "Fijar punto de partida"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEditRecord(r)}>
                <Pencil className="h-4 w-4" />
                Editar
              </DropdownMenuItem>
              {canStartBreakdown && (
                <DropdownMenuItem onSelect={() => toggleExpanded(r.id)}>
                  <ListPlus className="h-4 w-4" />
                  Agregar desglose de registro
                </DropdownMenuItem>
              )}
              {PAYMENT_PROOF_CATEGORIES.has(r.category ?? "") && (
                <DropdownMenuItem onSelect={() => setProofsRecordId(r.id)}>
                  <Paperclip className="h-4 w-4" />
                  {r.paymentProofs.length > 0 ? `Comprobantes de pago (${r.paymentProofs.length})` : "Adjuntar comprobante de pago"}
                </DropdownMenuItem>
              )}
              {FACTURA_CATEGORIES.has(r.category ?? "") && (
                <>
                  <DropdownMenuItem onSelect={() => handleFacturaClick(r)} disabled={uploadingFacturaId === r.id}>
                    {uploadingFacturaId === r.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Paperclip className="h-4 w-4" />}
                    {r.facturaFileUrl ? "Ver factura" : "Adjuntar factura"}
                  </DropdownMenuItem>
                  {r.facturaFileUrl && (
                    <DropdownMenuItem
                      onSelect={() => handleDeleteFactura(r)}
                      disabled={deletingFacturaId === r.id}
                      className="text-destructive focus:text-destructive"
                    >
                      {deletingFacturaId === r.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <X className="h-4 w-4" />}
                      Quitar factura
                    </DropdownMenuItem>
                  )}
                </>
              )}
              <DropdownMenuItem
                onSelect={() => handleReclassify(r.id)}
                disabled={reclassifyingId === r.id}
                className={needsAiReview(r) ? "text-amber-600 focus:text-amber-700" : ""}
              >
                {reclassifyingId === r.id
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Sparkles className="h-4 w-4" />}
                {r.categorySource === "ai" && r.categoryConfidence != null
                  ? `Reclasificar con IA (${(r.categoryConfidence * 100).toFixed(0)}%)`
                  : "Reclasificar con IA"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => handleDelete([r.id])}
                disabled={isPending}
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
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <p className="text-muted-foreground">Aún no hay registros contables.</p>
      </div>
    )
  }

  // The record a "quick lock" would point to: the nearest top-level record immediately before
  // the first row currently shown, in true (unfiltered) ledger order — regardless of whatever
  // filter is hiding it. Skips nested child rows since anchoring on a sub-line-item would be
  // confusing — the real balance only ever moves on top-level rows anyway.
  const quickAnchorCandidateId = (() => {
    const firstShown = filtered[0]
    if (!firstShown) return null
    for (let i = firstShown.originalIndex - 1; i >= 0; i--) {
      if (recordsWithTrueBalance[i].parentRecordId == null) return recordsWithTrueBalance[i].id
    }
    return null
  })()

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
      {anchorRowId && (() => {
        const anchor = recordsWithTrueBalance.find((r) => r.id === anchorRowId)
        if (!anchor) return null
        return (
          <div className="-mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            Balance fijado desde {formatDate(anchor.date)} —{" "}
            <span className="font-medium text-foreground">{formatCurrency(anchor.trueBalance)}</span>
            <button
              onClick={() => setAnchorRowId(null)}
              title="Quitar punto de partida (ancla)"
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })()}
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setYearFilter(new Set())
            setMonthFilter(new Set())
            setCategoryFilter(new Set())
            setPropertyFilter(new Set())
            setAccountFilter(new Set())
            setInvoiceFilter(new Set())
            setSelected(new Set())
          }}
          disabled={!hasActiveFilters}
          title="Limpiar todos los filtros"
        >
          <X className="h-4 w-4" />
          Limpiar filtros
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => setAnchorRowId(anchorRowId ? null : quickAnchorCandidateId)}
          disabled={!anchorRowId && !quickAnchorCandidateId}
          title={anchorRowId ? "Quitar punto de partida" : "Fijar punto de partida en la fila anterior a la vista actual"}
        >
          {anchorRowId ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
        </Button>
        <div ref={colPickerRef} className="relative">
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
              <th className="w-8 px-0 py-3" />
              {col("id")             && <th className="px-4 py-3 text-left font-medium whitespace-nowrap">ID</th>}
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
              <th className="px-4 py-3 text-left font-medium whitespace-nowrap" />
            </tr>
          </thead>
          <tbody>
            {filteredWithBalance.map((r) => {
              const canBreakdownAsExpense = EXPENSE_BREAKDOWN_CATEGORIES.has(r.category ?? "")
              const isSplittablePayment = CASH_RECEIPT_CATEGORIES.has(r.category ?? "")
              const isExpanded = expandedParentIds.has(r.id) || forceExpandParentIds.has(r.id)
              const children = (canBreakdownAsExpense || isSplittablePayment) ? (childrenByParentId.get(r.id) ?? []) : []

              // Children take over the balance math that used to sit on the parent's row. The
              // parent's own delta already left the ledger in full the moment it happened —
              // regardless of how much of it has been explained by children so far — so the
              // running balance must always land exactly on the parent's own true value by the
              // LAST child (that's what the next top-level row continues from). We get that by
              // working backward: the last child shows the parent's own balance, and each earlier
              // child shows that value with the later children's own deltas undone. If the parent
              // isn't fully explained yet, the still-unexplained amount is absorbed invisibly
              // between the parent and its first child, instead of creating a mismatch with the
              // row that follows.
              const childBalances = new Array<number | null>(children.length)
              let running = r.computedBalance != null ? Number(r.computedBalance) : null
              for (let i = children.length - 1; i >= 0; i--) {
                childBalances[i] = running
                if (running != null) {
                  running -= Number(children[i].income ?? 0) - Number(children[i].expenses ?? 0)
                }
              }
              const childrenWithBalance = children.map((child, i) => ({
                ...child,
                computedBalance: childBalances[i] != null ? childBalances[i]!.toFixed(2) : null,
                // Display-only: bankMovementId is unique per row in the DB (it's the actual bank
                // movement a record came from), so a child can never really own the parent's —
                // but showing the parent's here makes the Movimiento column read the same for
                // the whole group instead of falling back to a generic "Ver extracto" link.
                bankMovementId: r.bankMovementId,
              }))

              // Once the children's amounts already add up to the parent's own, there's nothing
              // left to explain — hide the "agregar" row instead of inviting an over-explanation.
              const pendingAmount = Number(r.income ?? r.expenses ?? 0) - children.reduce((sum, c) => sum + Number(c.income ?? c.expenses ?? 0), 0)

              return (
                <Fragment key={r.id}>
                  {renderRow(r, false)}
                  {(canBreakdownAsExpense || isSplittablePayment) && isExpanded && (
                    <>
                      {childrenWithBalance.map((child, i) =>
                        renderRow(child, true, pendingAmount <= 0 && i === childrenWithBalance.length - 1)
                      )}
                      {pendingAmount > 0 && (
                        <AddChildRecordRow parentId={r.id} isExpenseBreakdown={canBreakdownAsExpense} defaultDate={r.date} colSpan={visibleColumnCount} />
                      )}
                    </>
                  )}
                </Fragment>
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
        owners={owners}
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

      <PaymentProofsDialog
        accountingRecordId={proofsRecordId}
        proofs={records.find((r) => r.id === proofsRecordId)?.paymentProofs ?? []}
        open={proofsRecordId !== null}
        onClose={() => setProofsRecordId(null)}
        onChanged={() => {}}
      />

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
