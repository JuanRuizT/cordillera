"use client"

import { Fragment, useState, useTransition, useRef, useEffect } from "react"
import { toast } from "sonner"
import { deleteAccountingRecords, updateAccountingRecord, reclassifyRecord, generateCashReceipt, generateCashReceiptsBulk, deleteCashReceiptsBulk, generateExpenseVouchersBulk, setSupportNotRequired } from "./actions"
import type { CashReceiptData, ExpenseVoucherData, PaymentProofRow } from "@/lib/accounting/document-data"
import { PaymentProofsDialog } from "./payment-proofs-dialog"
import { ExportDocumentsDialog } from "./export-documents-dialog"
import { todayStamp } from "@/lib/date-format"
import { formatUnitLabel } from "@/lib/units"
import { getInvoiceLiveData, type OpenInvoiceOption } from "../invoices/actions"
import type { InvoiceData } from "@/lib/invoices/document-data"
import type { ContractorData } from "../contractors/actions"
import type { FinancialAccountData } from "../accounts/actions"
import { Button } from "@/components/ui/button"
import { CategoryCombobox } from "@/components/ui/category-combobox"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { MultiSelectFilter } from "@/components/ui/multi-select-filter"
import { CashReceiptModal } from "./cash-receipt-modal"
import { ExpenseVoucherModal } from "./expense-voucher-modal"
import { GenerateExpenseVoucherDialog } from "./generate-voucher-dialog"
import { LinkInvoiceDialog } from "./link-invoice-dialog"
import { LinkBillDialog } from "./link-bill-dialog"
import { unlinkBillPayment, type BillLinkOption } from "../bills/actions"
import { LinkSocialSecurityDialog } from "./link-social-security-dialog"
import { unlinkSocialSecurityPayment, type SocialSecurityLinkOption } from "../social-security/actions"
import { InvoiceDocumentModal } from "../invoices/invoice-document-modal"
import { EditRecordDialog } from "./edit-record-dialog"
import { SupportNotRequiredDialog } from "./support-not-required-dialog"
import { AddChildRecordRow } from "./add-child-record-row"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Ban, Columns3, ChevronRight, ChevronDown, ChevronUp, Download, Eye, FileArchive, FileText, ListPlus, Loader2, Lock, LockOpen, MoreHorizontal, Paperclip, Pencil, Plus, RotateCcw, Sparkles, Trash2, Unlink, X } from "lucide-react"

// A row's "Acciones" menu is shown two ways — the three-dot DropdownMenu button, and a
// right-click ContextMenu on the row itself — both driven by the same list of actions so they
// can never drift apart. DropdownMenuItem/ContextMenuItem (and their Separators) share the same
// prop shape (onSelect/disabled/className/children), so one render function works for both.
type RowAction =
  | { type: "item"; key: string; icon: React.ReactNode; label: React.ReactNode; onSelect: () => void; disabled?: boolean; className?: string }
  | { type: "separator"; key: string }

function renderActionItems(
  actions: RowAction[],
  Item: typeof DropdownMenuItem,
  Separator: typeof DropdownMenuSeparator,
) {
  return actions.map((a) =>
    a.type === "separator" ? (
      <Separator key={a.key} />
    ) : (
      <Item key={a.key} onSelect={a.onSelect} disabled={a.disabled} className={a.className}>
        {a.icon}
        {a.label}
      </Item>
    )
  )
}

const COLUMNS = [
  { id: "number",         label: "N.°",                 defaultVisible: true },
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
  { id: "paymentProof",   label: "Comprobante de Pago", defaultVisible: true },
  { id: "invoiceLink",    label: "Cuenta de Cobro",     defaultVisible: true },
  { id: "billLink",       label: "Factura",             defaultVisible: true },
  { id: "socialSecurityLink", label: "Seguridad Social", defaultVisible: true },
] as const

type ColumnId = typeof COLUMNS[number]["id"]

// Same pattern as invoices-table.tsx's "invoices-hidden-cols" — remembers the export modal's
// column selection/order/format across reloads instead of resetting it every time it's opened.
// v2: the previous key could hold an empty selection written by the old load/persist race — a new
// key makes every browser start from DEFAULT_EXPORT_COLUMNS once instead of that stale value.
const LS_EXPORT_CONFIG_KEY = "accounting-export-config-v2"

// Columns (and order) the export modal starts with when nothing usable is saved.
const DEFAULT_EXPORT_COLUMNS: ColumnId[] = [
  "id",
  "concept",
  "date",
  "income",
  "expenses",
  "balance",
  "category",
  "property",
  "cashReceipt",
  "expenseVoucher",
  "invoiceLink",
]

function loadExportConfig(): { cols: ColumnId[]; format: "csv" } | null {
  try {
    const raw = localStorage.getItem(LS_EXPORT_CONFIG_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as { cols?: string[]; format?: string }
    // Filter against the current COLUMNS in case a saved id no longer exists (a column was
    // renamed/removed since).
    const cols = (saved.cols ?? []).filter((id): id is ColumnId => COLUMNS.some((c) => c.id === id))
    // An empty selection can't export anything, and treating it as a real saved config is what
    // left the modal permanently blank — fall back to the defaults instead.
    if (cols.length === 0) return null
    return { cols, format: "csv" }
  } catch {
    return null
  }
}

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
  supportNotRequired: boolean // "No requiere soporte": no comprobante de egreso / cuenta de cobro warning
  supportNotRequiredReason: string | null
  paymentProofs: PaymentProofRow[]
  billId: string | null
  billConcept: string | null
  billFileName: string | null // null when no bill is linked or the linked bill has no file uploaded
  socialSecurityId: string | null
  socialSecurityLabel: string | null // "Septiembre 2026" / "Inscripción"
  socialSecurityFileName: string | null // null when unlinked or the planilla has no PDF
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

// Rows that can be marked "No requiere soporte" — the ones that can carry either warning above.
const SUPPORT_DOCUMENT_CATEGORIES = new Set([...EXPENSE_VOUCHER_CATEGORIES, ...INVOICE_LINK_CATEGORIES])

// Only rows in these categories can be linked to a bill (recurring service/utility bill).
const BILL_CATEGORIES = new Set(["Facturas"])

// Rows that belong to a planilla in the Seguridad Social tab (one planilla, many payments).
const SOCIAL_SECURITY_CATEGORIES = new Set(["Seguridad social"])

// Only rows in these categories can be broken down into the Egresos that explain the cash.
const CASH_WITHDRAWAL_CATEGORIES = new Set(["Retiro en Efectivo"])

// Categories that can be broken down via the desglose mechanism at all. A "Retiro en Efectivo"
// only ever gets "Movimiento" children (cash relocated to another caja — see AddChildRecordRow's
// mode selection and createWithdrawalBreakdownRecord's own guard against Egreso there); a plain
// "Egreso" can bundle several purchases, and a "Retención en la fuente" can cover several
// different cuentas de cobro, each needing its own Egreso piece to link separately.
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

// `;` (not `,`) and a leading UTF-8 BOM — the combination Excel under a Spanish/Colombian locale
// (comma as decimal separator) expects to both split into columns correctly and keep tildes/eñes
// intact, instead of mangling them or dumping everything into a single cell.
const CSV_DELIMITER = ";"

function csvEscapeField(value: string): string {
  if (value.includes(CSV_DELIMITER) || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

// Plain numbers (no "$", no thousands separator) for income/expenses/balance — so Excel treats
// them as numbers it can sum, not text. Everything else already imported/rendered.
// "." → "," for the decimal point — matches the es-CO regional format Excel expects when a CSV
// is delimited with ";" (see CSV_DELIMITER), so these are read back in as real numbers, not text.
function formatDecimalForCsv(value: string | null): string {
  if (value == null) return ""
  return value.replace(".", ",")
}

function formatExportValue(
  row: AccountingRow & { computedBalance: string | null; exportRowNumber: number },
  columnId: ColumnId
): string {
  switch (columnId) {
    case "number": return String(row.exportRowNumber)
    case "id": return row.id
    case "date": {
      const [y, m, d] = row.date.slice(0, 10).split("-")
      return `${d}/${m}/${y}`
    }
    case "account": return row.accountName ?? ""
    case "movement": return row.bankMovementId ?? ""
    case "concept": return row.concept
    case "income": return formatDecimalForCsv(row.income)
    case "expenses": return formatDecimalForCsv(row.expenses)
    case "balance": return formatDecimalForCsv(row.computedBalance)
    case "category": return row.category ?? ""
    case "property": return row.property ? formatUnitLabel(row.property) : ""
    case "cashReceipt": return row.cashReceipts.map((cr) => String(cr.number).padStart(4, "0")).join(" | ")
    case "expenseVoucher": return row.expenseVoucher ? String(row.expenseVoucher.number).padStart(4, "0") : row.supportNotRequired ? "No aplica" : ""
    case "paymentProof": return row.paymentProofs.map((p) => p.fileName).join(" | ")
    case "invoiceLink": return row.invoiceNumber != null ? String(row.invoiceNumber).padStart(4, "0") : row.supportNotRequired ? "No aplica" : ""
    case "billLink": return row.billConcept ?? ""
    case "socialSecurityLink": return row.socialSecurityLabel ?? ""
    default: return ""
  }
}

type EditingCell = { id: string; field: string; value: string } | null

export function AccountingTable({ records, units, owners, openInvoices, contractors, accounts, bills, socialSecurityOptions }: { records: AccountingRow[]; units: string[]; owners: { unit: string; name: string }[]; openInvoices: OpenInvoiceOption[]; contractors: ContractorData[]; accounts: FinancialAccountData[]; bills: BillLinkOption[]; socialSecurityOptions: SocialSecurityLinkOption[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchorRowId, setAnchorRowId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState<EditingCell>(null)
  const [receiptModal, setReceiptModal] = useState<CashReceiptData | null>(null)
  const [generatingReceiptId, setGeneratingReceiptId] = useState<string | null>(null)
  const [reclassifyingId, setReclassifyingId] = useState<string | null>(null)
  const [bulkGeneratingReceipts, setBulkGeneratingReceipts] = useState(false)
  const [bulkDeletingReceipts, setBulkDeletingReceipts] = useState(false)
  const [bulkGeneratingVouchers, setBulkGeneratingVouchers] = useState(false)
  const [voucherModal, setVoucherModal] = useState<ExpenseVoucherData | null>(null)
  const [generateVoucherRecordId, setGenerateVoucherRecordId] = useState<string | null>(null)
  const [linkInvoiceRecord, setLinkInvoiceRecord] = useState<AccountingRow | null>(null)
  const [viewInvoice, setViewInvoice] = useState<InvoiceData | null>(null)
  const [viewInvoiceRecordId, setViewInvoiceRecordId] = useState<string | null>(null)
  const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null)
  const [editRecord, setEditRecord] = useState<AccountingRow | null>(null)
  const [expandedParentIds, setExpandedWithdrawalIds] = useState<Set<string>>(new Set())
  const [proofsRecordId, setProofsRecordId] = useState<string | null>(null)
  const [linkBillRecord, setLinkBillRecord] = useState<AccountingRow | null>(null)
  const [previewBillRecord, setPreviewBillRecord] = useState<AccountingRow | null>(null)
  const [unlinkBillTarget, setUnlinkBillTarget] = useState<AccountingRow | null>(null)
  const [linkSocialSecurityRecord, setLinkSocialSecurityRecord] = useState<AccountingRow | null>(null)
  const [previewSocialSecurityRecord, setPreviewSocialSecurityRecord] = useState<AccountingRow | null>(null)
  const [unlinkSocialSecurityTarget, setUnlinkSocialSecurityTarget] = useState<AccountingRow | null>(null)
  // "No requiere soporte" reason dialog. `ids` is kept while it closes so its text doesn't change
  // mid-animation; the dialog stays mounted (see SupportNotRequiredDialog for why).
  const [supportDialog, setSupportDialog] = useState<{ ids: string[]; open: boolean }>({ ids: [], open: false })
  const [yearFilter, setYearFilter] = useState<Set<string>>(new Set())
  const [monthFilter, setMonthFilter] = useState<Set<string>>(new Set())
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set())
  const [propertyFilter, setPropertyFilter] = useState<Set<string>>(new Set())
  const [accountFilter, setAccountFilter] = useState<Set<string>>(new Set())
  const [invoiceFilter, setInvoiceFilter] = useState<Set<string>>(new Set())
  const [visibleCols, setVisibleCols] = useState<Set<ColumnId>>(new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id)))
  const [colPickerOpen, setColPickerOpen] = useState(false)
  const colPickerRef = useRef<HTMLDivElement>(null)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  // Order matters here (unlike visibleCols) — this is the exact column order the CSV is written
  // in, not just which ones are included.
  // Read the saved config while creating the state rather than in a mount effect: the old effect
  // raced the persist effect below, which wrote the still-empty [] first — and under React Strict
  // Mode's double effect run in dev the loader then read that [] back. The initializer is safe for
  // SSR (localStorage throws on the server and loadExportConfig returns null) and for hydration
  // (this state is only rendered inside the export dialog, which is closed on load).
  const [exportColOrder, setExportColOrder] = useState<ColumnId[]>(() => loadExportConfig()?.cols ?? DEFAULT_EXPORT_COLUMNS)
  const [exportFormat, setExportFormat] = useState<"csv">("csv")
  // null = dialog closed; the ids snapshotted when the user clicked "Descargar documentos".
  const [exportDocsIds, setExportDocsIds] = useState<string[] | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(LS_EXPORT_CONFIG_KEY, JSON.stringify({ cols: exportColOrder, format: exportFormat }))
    } catch { /* */ }
  }, [exportColOrder, exportFormat])

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

  // Deep link /accounting#record-<id> (from Facturas' "Registro contable" column and the abonos
  // modal). Each row carries id="record-<id>" and highlights itself via CSS :target, so a
  // top-level row works natively — but a child row under a collapsed parent isn't in the DOM
  // at all, leaving the browser nothing to jump to. So: expand its parent, then scroll the row to
  // the center (a plain jump would tuck it under the sticky header) once it actually exists.
  const pendingScrollRecordId = useRef<string | null>(null)

  useEffect(() => {
    const revealHashRecord = () => {
      const match = /^#record-(.+)$/.exec(window.location.hash)
      if (!match) return
      const id = decodeURIComponent(match[1])
      const row = document.getElementById(`record-${id}`)
      if (row) {
        row.scrollIntoView({ block: "center" })
        return
      }
      const parentId = records.find((r) => r.id === id)?.parentRecordId
      if (!parentId) return
      pendingScrollRecordId.current = id
      setExpandedWithdrawalIds((prev) => (prev.has(parentId) ? prev : new Set(prev).add(parentId)))
    }
    const frame = requestAnimationFrame(revealHashRecord)
    window.addEventListener("hashchange", revealHashRecord)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("hashchange", revealHashRecord)
    }
    // Mount-time records are enough: which parent a record belongs to doesn't change under it,
    // and re-running on every revalidation would yank the scroll back after each edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Finishes a reveal that had to wait for its parent to expand. No deps on purpose: it runs after
  // every render, but it's a no-op the moment nothing is pending.
  useEffect(() => {
    const id = pendingScrollRecordId.current
    if (!id) return
    const row = document.getElementById(`record-${id}`)
    if (!row) return
    pendingScrollRecordId.current = null
    row.scrollIntoView({ block: "center" })
  })

  const toggleCol = (id: ColumnId) =>
    setVisibleCols((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const col = (id: ColumnId) => visibleCols.has(id)

  const addExportCol = (id: ColumnId) =>
    setExportColOrder((prev) => (prev.includes(id) ? prev : [...prev, id]))

  const removeExportCol = (id: ColumnId) =>
    setExportColOrder((prev) => prev.filter((c) => c !== id))

  const moveExportCol = (id: ColumnId, direction: -1 | 1) =>
    setExportColOrder((prev) => {
      const i = prev.indexOf(id)
      const j = i + direction
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

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
    // A "Movimiento" child is the one exception to "children don't move the balance again" —
    // unlike an Egreso-hijo (which just documents where already-counted money went), a Movimiento
    // is a real second event: the cash lands in a different account than its parent's.
    if (r.parentRecordId == null || r.category === "Movimiento") {
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

  // Used to keep the "Balance" column's running sum scoped to the active account filter — a row
  // (top-level or Movimiento child) only moves the displayed balance when its OWN accountId
  // matches, so filtering to one caja shows that caja's own running balance, not a global one
  // that still includes rows from other accounts pulled into view for context.
  const matchesAccountBalance = (accountId: string | null) =>
    accountFilter.size === 0 || (accountId != null && accountFilter.has(accountId))

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
      return { ...r, computedBalance: null as string | null, preChildrenBalance: null as string | null }
    }
    if (anchorIndex >= 0 && r.originalIndex === anchorIndex) {
      const anchorFixed = anchorBalance.toFixed(2)
      return { ...r, computedBalance: anchorFixed as string | null, preChildrenBalance: anchorFixed as string | null }
    }
    if (r.parentRecordId == null && matchesAccountBalance(r.accountId)) {
      runningBalance += Number(r.income ?? 0) - Number(r.expenses ?? 0)
    }
    // Captured right after the parent's own delta, before any Movimiento children are folded
    // in below — so the withdrawal's own row reads as "this left the bank," and its Movimiento
    // children's rows (see childBalances in the render loop) are what visibly bring it back.
    // A row whose own account doesn't match the active filter shows no balance of its own (it's
    // only visible for context, e.g. a withdrawal pulled in because its Movimiento child matches
    // the filtered caja) — preChildrenBalance still tracks the real running value regardless, so
    // that child's own row can pick up from the correct baseline below.
    const preChildrenBalance = runningBalance.toFixed(2)
    const ownComputedBalance = matchesAccountBalance(r.accountId) ? preChildrenBalance : null
    if (r.parentRecordId == null) {
      // `filtered` only ever contains top-level rows (children are rendered nested, never as
      // their own entry here — see the r.parentRecordId == null check building `filtered`
      // above), so a "Movimiento" child's own contribution would otherwise never reach this
      // running total at all. It's a real second event (cash landing in a different account),
      // not documentation of money already counted via its parent, so it has to be folded in
      // here, at the point its parent is processed — just after, not before, capturing the
      // parent's own displayed balance above. Only a child whose own account matches the active
      // filter counts — same rule as the parent, so a caja-filtered view doesn't pick up a
      // Movimiento that actually landed somewhere else.
      const movementChildren = (childrenByParentId.get(r.id) ?? []).filter((c) => c.category === "Movimiento")
      for (const c of movementChildren) {
        if (matchesAccountBalance(c.accountId)) {
          runningBalance += Number(c.income ?? 0) - Number(c.expenses ?? 0)
        }
      }
    }
    return { ...r, computedBalance: ownComputedBalance as string | null, preChildrenBalance: preChildrenBalance as string | null }
  })

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id))

  // checkbox col + expand-chevron col + visible data cols + Acciones col — used as the
  // colSpan for the nested child-record row so it spans the full table width.
  const visibleColumnCount = 2 + COLUMNS.filter((c) => col(c.id)).length + 1

  const eligibleSelectedForReceiptCount = filteredWithBalance.filter(
    (r) => selected.has(r.id) && CASH_RECEIPT_CATEGORIES.has(r.category ?? "") && r.cashReceipts.length === 0
  ).length

  // Only rows already linked to a cuenta de cobro can be generated in bulk — the contractor is
  // inherited from that invoice automatically; anything else needs one picked by hand via the
  // single-record dialog, so it's excluded here (and reported as "omitido" by the server action).
  const eligibleSelectedForVoucherCount = filteredWithBalance.filter(
    (r) => selected.has(r.id) && EXPENSE_VOUCHER_CATEGORIES.has(r.category ?? "") && !r.expenseVoucher && r.invoiceId != null
  ).length

  const selectedReceiptIds = filteredWithBalance
    .filter((r) => selected.has(r.id) && r.cashReceipts.length > 0)
    .flatMap((r) => r.cashReceipts.map((cr) => cr.id))

  const selectedSupportRows = filteredWithBalance.filter((r) => selected.has(r.id) && SUPPORT_DOCUMENT_CATEGORIES.has(r.category ?? ""))
  const selectedToMarkNoSupport = selectedSupportRows.filter((r) => !r.supportNotRequired).map((r) => r.id)
  const selectedToUnmarkNoSupport = selectedSupportRows.filter((r) => r.supportNotRequired).map((r) => r.id)

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

  const handleBulkExpenseVoucher = () => {
    // Order by table row order (not selection order) so consecutive numbers match what's on screen.
    const orderedIds = filteredWithBalance.filter((r) => selected.has(r.id)).map((r) => r.id)
    setBulkGeneratingVouchers(true)
    startTransition(async () => {
      const result = await generateExpenseVouchersBulk(orderedIds)
      setBulkGeneratingVouchers(false)
      if (result.error) {
        toast.error(result.error)
      } else if (result.generated === 0) {
        toast.error("No hay comprobantes nuevos para generar en la selección.")
      } else {
        toast.success(
          `${result.generated} comprobante${result.generated === 1 ? "" : "s"} de egreso generado${result.generated === 1 ? "" : "s"}.` +
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

  const handleRequireSupport = (ids: string[]) => {
    startTransition(async () => {
      const res = await setSupportNotRequired(ids, false)
      if (res.error) toast.error(res.error)
      else toast.success(res.updated === 1 ? "El registro vuelve a requerir soporte." : `${res.updated} registros vuelven a requerir soporte.`)
    })
  }

  // Shown instead of the amber "missing document" warning on rows marked "No requiere soporte".
  const noSupportBadge = (r: AccountingRow) => (
    <span
      title={`No requiere soporte${r.supportNotRequiredReason ? `: ${r.supportNotRequiredReason}` : ""}`}
      className="inline-flex cursor-default items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
    >
      N/A
    </span>
  )

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

  // Same shape as handleInvoiceLinkClick: a linked bill with an uploaded file opens its preview;
  // only an unlinked row (or a bill with nothing to show) goes to the chooser. Changing the link
  // is still reachable from the preview header.
  const handleBillLinkClick = (r: AccountingRow) => {
    if (r.billId && r.billFileName) {
      setPreviewBillRecord(r)
      return
    }
    setLinkBillRecord(r)
  }

  const confirmUnlinkBill = () => {
    const r = unlinkBillTarget
    if (!r) return
    setUnlinkBillTarget(null)
    startTransition(async () => {
      const res = await unlinkBillPayment(r.id)
      if (res.error) toast.error(res.error)
      else toast.success("Factura desvinculada del registro.")
    })
  }

  // Same flow as the Factura column: linked with a PDF -> preview (change/unlink from its header);
  // otherwise -> the chooser.
  const handleSocialSecurityClick = (r: AccountingRow) => {
    if (r.socialSecurityId && r.socialSecurityFileName) {
      setPreviewSocialSecurityRecord(r)
      return
    }
    setLinkSocialSecurityRecord(r)
  }

  const confirmUnlinkSocialSecurity = () => {
    const r = unlinkSocialSecurityTarget
    if (!r) return
    setUnlinkSocialSecurityTarget(null)
    startTransition(async () => {
      const res = await unlinkSocialSecurityPayment(r.id)
      if (res.error) toast.error(res.error)
      else toast.success("Pago desvinculado de la planilla.")
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
        data-inline-edit
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
        data-inline-edit
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
  const renderRow = (r: AccountingRow & { computedBalance: string | null }, nested: boolean, rowNumber: number, isLastInGroup = false) => {
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

    // Single source of truth for the row's actions, shared by the three-dot DropdownMenu and the
    // right-click ContextMenu below — see renderActionItems.
    const rowActions: RowAction[] = [
      {
        type: "item",
        key: "anchor",
        icon: r.id === anchorRowId ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />,
        label: r.id === anchorRowId ? "Quitar punto de partida" : "Fijar punto de partida",
        onSelect: () => toggleAnchor(r.id),
      },
      {
        type: "item",
        key: "edit",
        icon: <Pencil className="h-4 w-4" />,
        label: "Editar",
        onSelect: () => setEditRecord(r),
      },
      ...(canStartBreakdown
        ? [{
            type: "item" as const,
            key: "breakdown",
            icon: <ListPlus className="h-4 w-4" />,
            label: "Agregar desglose de registro",
            onSelect: () => toggleExpanded(r.id),
          }]
        : []),
      ...(PAYMENT_PROOF_CATEGORIES.has(r.category ?? "")
        ? [{
            type: "item" as const,
            key: "proofs",
            icon: <Paperclip className="h-4 w-4" />,
            label: r.paymentProofs.length > 0 ? `Comprobantes de pago (${r.paymentProofs.length})` : "Adjuntar comprobante de pago",
            onSelect: () => setProofsRecordId(r.id),
          }]
        : []),
      ...(SUPPORT_DOCUMENT_CATEGORIES.has(r.category ?? "") && !hasChildren
        ? [r.supportNotRequired
            ? {
                type: "item" as const,
                key: "support",
                icon: <RotateCcw className="h-4 w-4" />,
                label: "Requiere soporte",
                onSelect: () => handleRequireSupport([r.id]),
              }
            : {
                type: "item" as const,
                key: "support",
                icon: <Ban className="h-4 w-4" />,
                label: "No requiere soporte",
                onSelect: () => setSupportDialog({ ids: [r.id], open: true }),
              }]
        : []),
      {
        type: "item",
        key: "reclassify",
        icon: reclassifyingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />,
        label: r.categorySource === "ai" && r.categoryConfidence != null
          ? `Reclasificar con IA (${(r.categoryConfidence * 100).toFixed(0)}%)`
          : "Reclasificar con IA",
        onSelect: () => handleReclassify(r.id),
        disabled: reclassifyingId === r.id,
        className: needsAiReview(r) ? "text-amber-600 focus:text-amber-700" : "",
      },
      { type: "separator", key: "sep" },
      {
        type: "item",
        key: "delete",
        icon: <Trash2 className="h-4 w-4" />,
        label: "Eliminar",
        onSelect: () => handleDelete([r.id]),
        disabled: isPending,
        className: "text-destructive focus:text-destructive",
      },
    ]

    return (
      <ContextMenu key={r.id}>
      <ContextMenuTrigger asChild>
      <tr
        id={`record-${r.id}`}
        onClick={(e) => {
          // Ctrl/Cmd+click toggles this row's selection from anywhere in the row, not just the
          // checkbox — mirrors the usual OS/spreadsheet multi-select gesture. A plain click does
          // nothing here, so it never interferes with double-click-to-edit or the action buttons.
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            toggle(r.id)
          }
        }}
        onDoubleClick={(e) => {
          const target = e.target as HTMLElement
          // React bubbles events out of portals (this row's dropdown/context menu, combobox
          // popovers) up the component tree — only react to double-clicks physically inside the row.
          if (!e.currentTarget.contains(target)) return
          // Cells with their own double-click editing, and anything interactive, keep their behavior.
          if (target.closest("[data-inline-edit], button, a, input, select, textarea, label, [role='combobox']")) return
          setEditRecord(r)
        }}
        className={`border-b last:border-0 hover:bg-muted/30 target:bg-blue-100 dark:target:bg-blue-950/40 ${nested ? "bg-slate-50 dark:bg-slate-800/30" : ""} ${isExpandedParent ? `bg-slate-100 dark:bg-slate-800/60 border-t-2 ${groupBorder}` : ""} ${isLastInGroup ? `border-b-2 ${groupBorder}` : ""} ${selected.has(r.id) ? "bg-blue-100 dark:bg-blue-900/40 border-blue-200 dark:border-blue-800" : ""} ${r.id === anchorRowId ? "bg-blue-50 dark:bg-blue-950/20" : ""} ${needsMoreChildren ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}
      >
        {col("number") && (
          <td className={`px-4 py-3 text-right text-muted-foreground tabular-nums${inGroup ? ` border-l-4 ${groupBorder}` : ""}`}>
            {rowNumber}
          </td>
        )}
        <td className={`px-4 py-3${!col("number") && inGroup ? ` border-l-4 ${groupBorder}` : ""}`}>
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
            {r.computedBalance != null && (!hasChildren || isWithdrawal) ? formatCurrency(r.computedBalance) : <span className="text-muted-foreground">—</span>}
          </td>
        )}
        {col("category") && (
          <td className={`px-4 py-3${needsAiReview(r) ? " bg-amber-50 dark:bg-amber-950/30 ring-1 ring-inset ring-amber-300 dark:ring-amber-700" : ""}`}>
            <div className="flex items-center gap-1.5">
              {/* The table combobox is a clickable <span> with an in-cell <li> list (no button, no
                  portal), so mark it explicitly — double-clicking it must not also open the dialog. */}
              <div data-inline-edit className={needsJustification ? "underline decoration-amber-500 dark:decoration-amber-600" : ""}>
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
            <div data-inline-edit>
              <CategoryCombobox
                value={r.property ?? ""}
                onChange={(val) => startTransition(async () => { await updateAccountingRecord(r.id, "property", val) })}
                variant="table"
                options={units}
                formatLabel={formatUnitLabel}
                disabled={isIncomeChild}
              />
            </div>
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
          <td className={`px-4 py-3 text-center${EXPENSE_VOUCHER_CATEGORIES.has(r.category ?? "") && !hasChildren && !r.expenseVoucher && !r.supportNotRequired ? " bg-amber-50 dark:bg-amber-950/30 ring-1 ring-inset ring-amber-300 dark:ring-amber-700" : ""}`}>
            {EXPENSE_VOUCHER_CATEGORIES.has(r.category ?? "") && !hasChildren && !r.expenseVoucher && r.supportNotRequired && noSupportBadge(r)}
            {EXPENSE_VOUCHER_CATEGORIES.has(r.category ?? "") && !hasChildren && (r.expenseVoucher || !r.supportNotRequired) && (
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
        {col("paymentProof") && (
          <td className="px-4 py-3 text-center">
            {/* Same rows as the menu's "Adjuntar comprobante de pago" item; opens the same dialog
                (list, preview, add, remove). Informative only — a missing proof isn't flagged. */}
            {PAYMENT_PROOF_CATEGORIES.has(r.category ?? "") && (
              <button
                onClick={() => setProofsRecordId(r.id)}
                title={
                  r.paymentProofs.length > 0
                    ? `Comprobantes de pago: ${r.paymentProofs.map((p) => p.fileName).join(", ")}`
                    : "Adjuntar comprobante de pago"
                }
                className="mx-auto flex items-center justify-center gap-1.5"
              >
                {r.paymentProofs.length > 0
                  ? <Eye className="h-4 w-4 text-blue-600 hover:text-blue-700" />
                  : <Paperclip className="h-4 w-4 text-muted-foreground hover:text-foreground" />}
                {r.paymentProofs.length > 0 && (
                  <span className="font-mono text-xs text-blue-700 dark:text-blue-300">{r.paymentProofs.length}</span>
                )}
              </button>
            )}
          </td>
        )}
        {col("invoiceLink") && (
          <td className={`px-4 py-3 text-center${INVOICE_LINK_CATEGORIES.has(r.category ?? "") && !r.invoiceId && !hasChildren && !r.supportNotRequired ? " bg-amber-50 dark:bg-amber-950/30 ring-1 ring-inset ring-amber-300 dark:ring-amber-700" : ""}`}>
            {INVOICE_LINK_CATEGORIES.has(r.category ?? "") && !hasChildren && !r.invoiceId && r.supportNotRequired && noSupportBadge(r)}
            {INVOICE_LINK_CATEGORIES.has(r.category ?? "") && !hasChildren && (r.invoiceId || !r.supportNotRequired) && (
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
        {col("billLink") && (
          <td className={`px-4 py-3 text-center${BILL_CATEGORIES.has(r.category ?? "") && !r.billId && !hasChildren ? " bg-amber-50 dark:bg-amber-950/30 ring-1 ring-inset ring-amber-300 dark:ring-amber-700" : ""}`}>
            {BILL_CATEGORIES.has(r.category ?? "") && !hasChildren && (
              <button
                onClick={() => handleBillLinkClick(r)}
                title={
                  !r.billId
                    ? "Ligar a una factura"
                    : r.billFileName
                      ? `Ver factura: ${r.billConcept ?? ""}`
                      : `Factura sin archivo: ${r.billConcept ?? ""} — clic para cambiarla`
                }
                className="mx-auto flex items-center justify-center gap-1.5"
              >
                {r.billId && r.billFileName
                  ? <Eye className="h-4 w-4 text-blue-600 hover:text-blue-700" />
                  : <FileText className="h-4 w-4 text-muted-foreground hover:text-foreground" />}
                {r.billId && r.billConcept && (
                  <span className="max-w-[100px] truncate font-mono text-xs text-blue-700 dark:text-blue-300">
                    {r.billConcept}
                  </span>
                )}
              </button>
            )}
          </td>
        )}
        {col("socialSecurityLink") && (
          <td className={`px-4 py-3 text-center${SOCIAL_SECURITY_CATEGORIES.has(r.category ?? "") && !r.socialSecurityId && !hasChildren ? " bg-amber-50 dark:bg-amber-950/30 ring-1 ring-inset ring-amber-300 dark:ring-amber-700" : ""}`}>
            {SOCIAL_SECURITY_CATEGORIES.has(r.category ?? "") && !hasChildren && (
              <button
                onClick={() => handleSocialSecurityClick(r)}
                title={
                  !r.socialSecurityId
                    ? "Vincular a una planilla de seguridad social"
                    : r.socialSecurityFileName
                      ? `Ver planilla: ${r.socialSecurityLabel ?? ""}`
                      : `Planilla sin PDF: ${r.socialSecurityLabel ?? ""} — clic para cambiarla`
                }
                className="mx-auto flex items-center justify-center gap-1.5"
              >
                {r.socialSecurityId && r.socialSecurityFileName
                  ? <Eye className="h-4 w-4 text-blue-600 hover:text-blue-700" />
                  : <FileText className="h-4 w-4 text-muted-foreground hover:text-foreground" />}
                {r.socialSecurityId && r.socialSecurityLabel && (
                  <span className="max-w-[110px] truncate text-xs text-blue-700 dark:text-blue-300">
                    {r.socialSecurityLabel}
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
              {renderActionItems(rowActions, DropdownMenuItem, DropdownMenuSeparator)}
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {renderActionItems(rowActions, ContextMenuItem, ContextMenuSeparator)}
      </ContextMenuContent>
      </ContextMenu>
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

  // Sequential position among the rows actually being rendered right now — recomputed fresh on
  // every render, so it naturally restarts at 1 whenever a filter changes what's shown, without
  // any special-case reset logic.
  let rowNumber = 0

  const handleExport = () => {
    if (exportColOrder.length === 0 || filteredWithBalance.length === 0) return

    // Same rows the filters currently show, flattened parent-then-its-children — a collapsed
    // group's children are still real filtered-in transactions, just not expanded on screen. The
    // "N.°" column here is the row's position in this exported list, not whatever it happened to
    // show on screen (which skips collapsed children entirely).
    const columns = exportColOrder.map((id) => COLUMNS.find((c) => c.id === id)!)
    const exportRows: (AccountingRow & { computedBalance: string | null; exportRowNumber: number })[] = []
    for (const r of filteredWithBalance) {
      exportRows.push({ ...r, exportRowNumber: exportRows.length + 1 })
      for (const child of childrenByParentId.get(r.id) ?? []) {
        exportRows.push({ ...child, computedBalance: null, exportRowNumber: exportRows.length + 1 })
      }
    }

    const lines = [
      columns.map((c) => csvEscapeField(c.label)).join(CSV_DELIMITER),
      ...exportRows.map((row) =>
        columns.map((c) => csvEscapeField(formatExportValue(row, c.id))).join(CSV_DELIMITER)
      ),
    ]
    const csv = "﻿" + lines.join("\r\n")

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `contabilidad-${todayStamp()}.csv`
    a.click()
    URL.revokeObjectURL(url)

    setExportDialogOpen(false)
    toast.success("Archivo CSV exportado.")
  }

  const handleExportDocuments = () => {
    // Selection, or everything currently filtered if nothing is selected — same rule as the CSV
    // export, and same parent→children flattening (a collapsed group's children still count).
    const baseRows = selected.size > 0 ? filteredWithBalance.filter((r) => selected.has(r.id)) : filteredWithBalance
    if (baseRows.length === 0) return

    const ids: string[] = []
    for (const r of baseRows) {
      ids.push(r.id)
      for (const child of childrenByParentId.get(r.id) ?? []) ids.push(child.id)
    }
    setExportDocsIds(ids)
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
          options={uniqueProperties.map((p) => ({ value: p, label: formatUnitLabel(p), title: p }))}
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExportDialogOpen(true)}
        >
          <Download className="h-4 w-4" />
          Exportar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportDocuments}
          disabled={filteredWithBalance.length === 0}
          title={selected.size > 0 ? "Descargar los documentos de los registros seleccionados" : "Descargar los documentos de los registros filtrados"}
        >
          <FileArchive className="h-4 w-4" />
          Descargar documentos
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b bg-muted text-muted-foreground">
              {col("number") && <th className="px-4 py-3 text-right font-medium whitespace-nowrap">N.°</th>}
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
              {col("paymentProof")   && <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Comprobante de Pago</th>}
              {col("invoiceLink")    && <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Cuenta de Cobro</th>}
              {col("billLink")       && <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Factura</th>}
              {col("socialSecurityLink") && <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Seguridad Social</th>}
              <th className="px-4 py-3 text-left font-medium whitespace-nowrap" />
            </tr>
          </thead>
          <tbody>
            {filteredWithBalance.map((r) => {
              const canBreakdownAsExpense = EXPENSE_BREAKDOWN_CATEGORIES.has(r.category ?? "")
              const isSplittablePayment = CASH_RECEIPT_CATEGORIES.has(r.category ?? "")
              const isWithdrawalGroup = CASH_WITHDRAWAL_CATEGORIES.has(r.category ?? "")
              const isExpanded = expandedParentIds.has(r.id) || forceExpandParentIds.has(r.id)
              const children = (canBreakdownAsExpense || isSplittablePayment) ? (childrenByParentId.get(r.id) ?? []) : []

              const childBalances = new Array<number | null>(children.length)
              if (isWithdrawalGroup) {
                // A withdrawal's children are always Movimiento — real second events, not
                // documentation — so unlike the Egreso/split-payment case below, they step
                // FORWARD from the parent's own balance instead of backward from it: the
                // withdrawal's row shows the money leaving the bank, and each Movimiento child's
                // row shows it (or its share) landing in the destination caja. Seeded from
                // preChildrenBalance rather than computedBalance — the parent's own row can be
                // "—" (its account doesn't match an active account filter) while its Movimiento
                // children still need a real baseline to step forward from. Same filter applies
                // per child: one that landed in an account not currently selected in the filter
                // shows no balance of its own either.
                let running = r.preChildrenBalance != null ? Number(r.preChildrenBalance) : null
                for (let i = 0; i < children.length; i++) {
                  if (matchesAccountBalance(children[i].accountId)) {
                    if (running != null) {
                      running += Number(children[i].income ?? 0) - Number(children[i].expenses ?? 0)
                    }
                    childBalances[i] = running
                  } else {
                    childBalances[i] = null
                  }
                }
              } else {
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
                let running = r.computedBalance != null ? Number(r.computedBalance) : null
                for (let i = children.length - 1; i >= 0; i--) {
                  childBalances[i] = running
                  if (running != null) {
                    running -= Number(children[i].income ?? 0) - Number(children[i].expenses ?? 0)
                  }
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
                  {renderRow(r, false, ++rowNumber)}
                  {(canBreakdownAsExpense || isSplittablePayment) && isExpanded && (
                    <>
                      {childrenWithBalance.map((child, i) =>
                        renderRow(child, true, ++rowNumber, pendingAmount <= 0 && i === childrenWithBalance.length - 1)
                      )}
                      {pendingAmount > 0 && (
                        <AddChildRecordRow
                          parentId={r.id}
                          mode={
                            CASH_WITHDRAWAL_CATEGORIES.has(r.category ?? "")
                              ? "movement"
                              : canBreakdownAsExpense
                                ? "expense"
                                : "income-split"
                          }
                          accounts={accounts}
                          excludeAccountId={r.accountId}
                          defaultDate={r.date}
                          colSpan={visibleColumnCount}
                        />
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
          {eligibleSelectedForVoucherCount > 0 && (
            <Button variant="outline" size="sm" disabled={bulkGeneratingVouchers} onClick={handleBulkExpenseVoucher}>
              {bulkGeneratingVouchers
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <FileText className="h-4 w-4" />}
              Generar comprobantes de egreso ({eligibleSelectedForVoucherCount})
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
          {selectedToMarkNoSupport.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setSupportDialog({ ids: selectedToMarkNoSupport, open: true })}>
              <Ban className="h-4 w-4" />
              No requiere soporte ({selectedToMarkNoSupport.length})
            </Button>
          )}
          {selectedToUnmarkNoSupport.length > 0 && (
            <Button variant="outline" size="sm" disabled={isPending} onClick={() => handleRequireSupport(selectedToUnmarkNoSupport)}>
              <RotateCcw className="h-4 w-4" />
              Requiere soporte ({selectedToUnmarkNoSupport.length})
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

      <SupportNotRequiredDialog
        ids={supportDialog.ids}
        open={supportDialog.open}
        onOpenChange={(open) => setSupportDialog((prev) => ({ ...prev, open }))}
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

      <LinkBillDialog
        record={linkBillRecord}
        bills={bills}
        open={linkBillRecord !== null}
        onClose={() => setLinkBillRecord(null)}
      />

      <Dialog open={previewBillRecord !== null} onOpenChange={(v) => { if (!v) setPreviewBillRecord(null) }}>
        <DialogContent className="w-full max-w-4xl gap-0 p-0">
          <div className="flex items-center justify-between gap-2 border-b py-2 pl-4 pr-12">
            <DialogTitle className="truncate text-sm font-medium">
              Factura — {previewBillRecord?.billConcept ?? previewBillRecord?.billFileName}
            </DialogTitle>
            {previewBillRecord && (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const r = previewBillRecord
                    setPreviewBillRecord(null)
                    setLinkBillRecord(r)
                  }}
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" /> Cambiar factura
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const r = previewBillRecord
                    setPreviewBillRecord(null)
                    setUnlinkBillTarget(r)
                  }}
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  <Unlink className="h-3.5 w-3.5" /> Desvincular
                </button>
                <a
                  href={`/api/bills/${previewBillRecord.billId}/document`}
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium hover:bg-muted"
                >
                  <Download className="h-3.5 w-3.5" /> Descargar
                </a>
              </div>
            )}
          </div>
          <DialogDescription className="sr-only">Previsualización de la factura</DialogDescription>
          {previewBillRecord && (
            /\.(jpe?g|png)$/i.test(previewBillRecord.billFileName ?? "") ? (
              <div className="flex h-[80vh] w-full items-center justify-center overflow-auto bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/bills/${previewBillRecord.billId}/document`}
                  alt="Factura"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : (
              <iframe
                src={`/api/bills/${previewBillRecord.billId}/document`}
                title="Factura"
                className="h-[80vh] w-full"
              />
            )
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={unlinkBillTarget !== null} onOpenChange={(v) => { if (!v) setUnlinkBillTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desvincular factura</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Desvincular la factura &quot;{unlinkBillTarget?.billConcept}&quot; de este registro? La factura vuelve
              a quedar pendiente en Facturas y la podés vincular de nuevo cuando quieras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUnlinkBill}>Desvincular</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LinkSocialSecurityDialog
        record={linkSocialSecurityRecord}
        options={socialSecurityOptions}
        open={linkSocialSecurityRecord !== null}
        onClose={() => setLinkSocialSecurityRecord(null)}
      />

      <Dialog open={previewSocialSecurityRecord !== null} onOpenChange={(v) => { if (!v) setPreviewSocialSecurityRecord(null) }}>
        <DialogContent className="w-full max-w-4xl gap-0 p-0">
          <div className="flex items-center justify-between gap-2 border-b py-2 pl-4 pr-12">
            <DialogTitle className="truncate text-sm font-medium">
              Planilla de seguridad social — {previewSocialSecurityRecord?.socialSecurityLabel}
            </DialogTitle>
            {previewSocialSecurityRecord && (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const r = previewSocialSecurityRecord
                    setPreviewSocialSecurityRecord(null)
                    setLinkSocialSecurityRecord(r)
                  }}
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" /> Cambiar planilla
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const r = previewSocialSecurityRecord
                    setPreviewSocialSecurityRecord(null)
                    setUnlinkSocialSecurityTarget(r)
                  }}
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  <Unlink className="h-3.5 w-3.5" /> Desvincular
                </button>
                <a
                  href={`/api/social-security/${previewSocialSecurityRecord.socialSecurityId}/document`}
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium hover:bg-muted"
                >
                  <Download className="h-3.5 w-3.5" /> Descargar
                </a>
              </div>
            )}
          </div>
          <DialogDescription className="sr-only">Previsualización de la planilla</DialogDescription>
          {previewSocialSecurityRecord && (
            /\.(jpe?g|png)$/i.test(previewSocialSecurityRecord.socialSecurityFileName ?? "") ? (
              <div className="flex h-[80vh] w-full items-center justify-center overflow-auto bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/social-security/${previewSocialSecurityRecord.socialSecurityId}/document`} alt="Planilla" className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              <iframe src={`/api/social-security/${previewSocialSecurityRecord.socialSecurityId}/document`} title="Planilla" className="h-[80vh] w-full" />
            )
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={unlinkSocialSecurityTarget !== null} onOpenChange={(v) => { if (!v) setUnlinkSocialSecurityTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desvincular de la planilla</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Desvincular este pago de la planilla &quot;{unlinkSocialSecurityTarget?.socialSecurityLabel}&quot;? El pago se
              deja de contar en la pestaña Seguridad Social y lo podés vincular de nuevo cuando quieras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUnlinkSocialSecurity}>Desvincular</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PaymentProofsDialog
        accountingRecordId={proofsRecordId}
        proofs={records.find((r) => r.id === proofsRecordId)?.paymentProofs ?? []}
        open={proofsRecordId !== null}
        onClose={() => setProofsRecordId(null)}
        onChanged={() => {}}
      />

      <ExportDocumentsDialog ids={exportDocsIds} onOpenChange={(v) => { if (!v) setExportDocsIds(null) }} />

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-xl p-6">
          <div className="flex flex-col gap-1.5">
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-4.5 w-4.5 text-muted-foreground" />
              Exportar Contabilidad
            </DialogTitle>
            <DialogDescription>Elige qué columnas incluir y en qué orden aparecerán en el archivo.</DialogDescription>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="overflow-hidden rounded-lg border">
              <div className="flex items-center justify-between bg-muted px-3 py-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  Disponibles {COLUMNS.length - exportColOrder.length > 0 && `(${COLUMNS.length - exportColOrder.length})`}
                </span>
                <button
                  onClick={() => setExportColOrder(COLUMNS.map((c) => c.id))}
                  disabled={exportColOrder.length === COLUMNS.length}
                  className="text-xs font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-40"
                >
                  Agregar todas
                </button>
              </div>
              <div className="h-64 overflow-auto">
                {COLUMNS.filter((c) => !exportColOrder.includes(c.id)).map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => addExportCol(c.id)}
                    className={`group flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 ${i % 2 === 0 ? "" : "bg-muted/20"}`}
                  >
                    <span className="truncate">{c.label}</span>
                    <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
                  </button>
                ))}
                {exportColOrder.length === COLUMNS.length && (
                  <p className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
                    Todas las columnas ya están agregadas.
                  </p>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border">
              <div className="flex items-center justify-between bg-muted px-3 py-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  Seleccionadas {exportColOrder.length > 0 && `(${exportColOrder.length})`}
                </span>
                <button
                  onClick={() => setExportColOrder([])}
                  disabled={exportColOrder.length === 0}
                  className="text-xs font-medium text-muted-foreground hover:text-destructive hover:underline disabled:pointer-events-none disabled:opacity-40"
                >
                  Quitar todas
                </button>
              </div>
              <div className="h-64 overflow-auto">
                {exportColOrder.map((id, i) => {
                  const c = COLUMNS.find((col) => col.id === id)!
                  return (
                    <div
                      key={id}
                      className={`flex items-center gap-2 px-2 py-1.5 text-sm ${i % 2 === 0 ? "" : "bg-muted/20"}`}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium tabular-nums text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="flex-1 truncate">{c.label}</span>
                      <div className="flex shrink-0 items-center">
                        <button
                          onClick={() => moveExportCol(id, -1)}
                          disabled={i === 0}
                          className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                          title="Subir"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => moveExportCol(id, 1)}
                          disabled={i === exportColOrder.length - 1}
                          className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                          title="Bajar"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => removeExportCol(id)}
                          className="rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive"
                          title="Quitar"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
                {exportColOrder.length === 0 && (
                  <p className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
                    Ninguna columna seleccionada.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground">Formato</label>
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as "csv")}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="csv">CSV</option>
              </select>
              <span aria-hidden className="mx-1 h-5 w-px bg-border" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExportColOrder(DEFAULT_EXPORT_COLUMNS)}
                disabled={exportColOrder.length === DEFAULT_EXPORT_COLUMNS.length && exportColOrder.every((id, i) => id === DEFAULT_EXPORT_COLUMNS[i])}
                title="Volver a las columnas y el orden por defecto"
                className="text-muted-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restablecer
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setExportDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleExport} disabled={exportColOrder.length === 0 || filteredWithBalance.length === 0}>
                <Download className="h-4 w-4" />
                Descargar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
