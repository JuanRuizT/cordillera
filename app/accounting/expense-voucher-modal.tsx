"use client"

import { useEffect, useRef, useState } from "react"
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
import {
  deleteExpenseVoucher,
  updateAccountingRecord,
  updateExpenseVoucherContractor,
  updateExpenseVoucherNumber,
  getExpenseVoucherLiveData,
  type ExpenseVoucherData,
} from "./actions"
import type { ContractorData } from "../contractors/actions"
import type { FinancialAccountData } from "../accounts/actions"

const BUILDING_NAME = "EDIFICIO CORDILLERA - PROPIEDAD HORIZONTAL"
const NIT = "902000058-9"
const ADDRESS = "Carrera 24 # 64A-41"
const CITY = "Manizales, Caldas - Colombia"

const VOUCHER_CSS = `
  .ev-doc { font-family: Arial, sans-serif; font-size: 11px; color: #000; padding: 24px; border: 1px solid #8c8c8c; }
  .ev-doc * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .ev-head { text-align: center; line-height: 1.45; }
  .ev-building { font-size: 15px; font-weight: bold; color: #1f3864; text-transform: uppercase; letter-spacing: .3px; }
  .ev-italic { font-style: italic; }
  .ev-titlebar { display: flex; justify-content: space-between; align-items: baseline; border-top: 1.5px solid #1f3864; border-bottom: 1.5px solid #1f3864; padding: 7px 2px; margin-top: 8px; }
  .ev-titlebar .tt { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
  .ev-titlebar .nn { font-size: 12px; font-weight: bold; }
  .ev-titlebar .nn b { margin-left: 70px; }
  .ev-sect { margin-top: 12px; }
  .ev-bar { background: #dde3f0; font-weight: bold; text-transform: uppercase; padding: 4px 8px; border: 1px solid #8c8c8c; }
  .ev-info { border: 1px solid #8c8c8c; border-top: none; padding: 4px 8px; }
  .ev-info .ln { display: flex; padding: 2px 0; }
  .ev-info .k { width: 120px; font-weight: bold; text-transform: uppercase; }
  .ev-info .v { flex: 1; }
  table.ev-t { width: 100%; border-collapse: collapse; }
  table.ev-t td { border: 1px solid #8c8c8c; padding: 4px 8px; vertical-align: top; }
  .ev-navy { background: #1f3864; color: #fff; font-weight: bold; text-transform: uppercase; letter-spacing: .3px; }
  .ev-r { text-align: right; }
  .ev-b { font-weight: bold; }
  .ev-footer { display: flex; gap: 16px; margin-top: 16px; align-items: stretch; }
  .ev-footer .pay { flex: 1; }
  .ev-sign { flex: 1; border: 1px solid #8c8c8c; display: flex; flex-direction: column; min-height: 80px; }
  .ev-sign .top { text-align: center; padding: 4px; }
`

function formatVoucherDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  const date = new Date(y, m - 1, d)
  const month = date.toLocaleDateString("es-CO", { month: "long" })
  const monthCapitalized = month.charAt(0).toUpperCase() + month.slice(1)
  return `${d} de ${monthCapitalized} del ${y}`
}

function formatCurrency(value: string | number) {
  return Number(value).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

interface ExpenseVoucherModalProps {
  voucher: ExpenseVoucherData | null
  open: boolean
  onClose: () => void
  onDeleted?: () => void
  contractors: ContractorData[]
  accounts: FinancialAccountData[]
}

export function ExpenseVoucherModal({ voucher, open, onClose, onDeleted, contractors, accounts }: ExpenseVoucherModalProps) {
  const [live, setLive] = useState<ExpenseVoucherData | null>(null)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [delConfirm, setDelConfirm] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setLive(voucher) }, [voucher])

  if (!live) return null

  const number = String(live.number).padStart(4, "0")
  const amountFormatted = `$${formatCurrency(live.amount)}`

  function startEdit(field: string, value: string) {
    setEditingField(field)
    setDraft(value)
  }

  function cancelEdit() {
    setEditingField(null)
    setDraft("")
  }

  async function commitEdit(field: string, value: string) {
    if (!live || saving) return
    const trimmed = value.trim()

    // Voucher number has its own action with uniqueness check
    if (field === "number") {
      const n = parseInt(trimmed, 10)
      if (isNaN(n) || n < 1 || String(n) !== trimmed) { cancelEdit(); return }
      if (n === live.number) { cancelEdit(); return }
      setSaving(true)
      setEditingField(null)
      try {
        const res = await updateExpenseVoucherNumber(live.id, n)
        if (res.error) {
          toast.error(res.error)
        } else {
          const fresh = await getExpenseVoucherLiveData(live.id)
          if (fresh) setLive(fresh)
        }
      } catch {
        toast.error("No se pudo actualizar el número.")
      } finally {
        setSaving(false)
      }
      return
    }

    // Contractor has its own action — it lives on ExpenseVoucher, not on AccountingRecord.
    if (field === "contractor") {
      if (!trimmed || trimmed === live.contractorId) { cancelEdit(); return }
      setSaving(true)
      setEditingField(null)
      try {
        const res = await updateExpenseVoucherContractor(live.id, trimmed)
        if (res.error) {
          toast.error(res.error)
        } else if (res.voucher) {
          setLive(res.voucher)
        }
      } catch {
        toast.error("No se pudo actualizar el contratista.")
      } finally {
        setSaving(false)
      }
      return
    }

    // Map modal field name → AccountingRecord field
    let recordField: string
    let recordValue: string
    switch (field) {
      case "date":
        recordField = "date"
        recordValue = trimmed
        break
      case "concept":
        if (!trimmed) { cancelEdit(); return }
        recordField = "concept"
        recordValue = trimmed
        break
      case "amount":
        recordField = "expenses"
        recordValue = trimmed
        break
      case "paymentMethod":
        recordField = "accountId"
        recordValue = trimmed
        break
      default:
        cancelEdit()
        return
    }

    setSaving(true)
    setEditingField(null)
    try {
      await updateAccountingRecord(live.accountingRecordId, recordField, recordValue)
      const fresh = await getExpenseVoucherLiveData(live.id)
      if (fresh) setLive(fresh)
    } catch {
      toast.error("No se pudo guardar el cambio.")
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, field: string) {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(field, draft) }
    if (e.key === "Escape") { e.preventDefault(); cancelEdit() }
  }

  const editableSpan = (field: string, display: string, extraStyle?: React.CSSProperties) => (
    editingField === field ? (
      <input
        ref={inputRef}
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitEdit(field, draft)}
        onKeyDown={(e) => handleKeyDown(e, field)}
        style={{ font: "inherit", border: "1px solid #1f3864", borderRadius: 2, padding: "0 4px", width: "100%", background: "#fff", ...extraStyle }}
      />
    ) : (
      <span
        className="v"
        style={{ cursor: saving ? "wait" : "text", borderRadius: 2, padding: "0 2px", ...extraStyle }}
        onDoubleClick={() => !saving && startEdit(field, display)}
        title="Doble clic para editar"
      >
        {display || "—"}
      </span>
    )
  )

  const editableDateSpan = () => (
    editingField === "date" ? (
      <input
        ref={inputRef}
        autoFocus
        type="date"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitEdit("date", draft || live.date.slice(0, 10))}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commitEdit("date", draft || live.date.slice(0, 10)) }
          if (e.key === "Escape") { e.preventDefault(); cancelEdit() }
        }}
        style={{ font: "inherit", border: "1px solid #1f3864", borderRadius: 2, padding: "0 4px", background: "#fff" }}
      />
    ) : (
      <span
        className="v"
        style={{ cursor: saving ? "wait" : "text", borderRadius: 2, padding: "0 2px" }}
        onDoubleClick={() => !saving && startEdit("date", live.date.slice(0, 10))}
        title="Doble clic para editar"
      >
        {formatVoucherDate(live.date)}
      </span>
    )
  )

  const editableAmountSpan = () => (
    editingField === "amount" ? (
      <input
        ref={inputRef}
        autoFocus
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitEdit("amount", draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commitEdit("amount", draft) }
          if (e.key === "Escape") { e.preventDefault(); cancelEdit() }
        }}
        style={{ font: "inherit", border: "1px solid #1f3864", borderRadius: 2, padding: "0 4px", width: "100px", textAlign: "right", background: "#fff" }}
      />
    ) : (
      <span
        className="ev-r ev-b"
        style={{ cursor: saving ? "wait" : "text", borderRadius: 2, padding: "0 2px" }}
        onDoubleClick={() => !saving && startEdit("amount", live.amount)}
        title="Doble clic para editar"
      >
        {amountFormatted}
      </span>
    )
  )

  const contractorSelectSpan = () => (
    editingField === "contractor" ? (
      <select
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitEdit("contractor", draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commitEdit("contractor", draft) }
          if (e.key === "Escape") { e.preventDefault(); cancelEdit() }
        }}
        style={{ font: "inherit", border: "1px solid #1f3864", borderRadius: 2, padding: "0 4px", background: "#fff", width: "100%" }}
      >
        {contractors.map((c) => (
          <option key={c.id} value={c.id}>{c.name} — {c.idNumber}</option>
        ))}
      </select>
    ) : (
      <span
        className="v"
        style={{ cursor: saving ? "wait" : "text", borderRadius: 2, padding: "0 2px" }}
        onDoubleClick={() => !saving && startEdit("contractor", live.contractorId ?? "")}
        title="Doble clic para editar"
      >
        {live.contractorName}
      </span>
    )
  )

  const paymentAccountSelectSpan = () => (
    editingField === "paymentMethod" ? (
      <select
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitEdit("paymentMethod", draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commitEdit("paymentMethod", draft) }
          if (e.key === "Escape") { e.preventDefault(); cancelEdit() }
        }}
        style={{ font: "inherit", border: "1px solid #1f3864", borderRadius: 2, padding: "0 4px", background: "#fff" }}
      >
        <option value="">— Sin cuenta —</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
    ) : (
      <span
        className="v"
        style={{ cursor: saving ? "wait" : "text", borderRadius: 2, padding: "0 2px" }}
        onDoubleClick={() => !saving && startEdit("paymentMethod", live.accountId ?? "")}
        title="Doble clic para editar"
      >
        {live.paymentMethod}
      </span>
    )
  )

  const handleDownloadPdf = async () => {
    if (!live || downloading) return
    setDownloading(true)
    try {
      const { generateVoucherBlob } = await import("./expense-voucher-pdf")
      const blob = await generateVoucherBlob(live)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `Comprobante-Egreso-${number}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("No se pudo generar el PDF.")
    } finally {
      setDownloading(false)
    }
  }

  const runDelete = () => {
    if (!live || deleting) return
    setDeleting(true)
    deleteExpenseVoucher(live.id)
      .then((res) => {
        if (res.error) {
          toast.error(res.error)
        } else {
          onDeleted?.()
          toast.success(`Comprobante N° ${number} borrado.`)
        }
      })
      .finally(() => setDeleting(false))
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="w-full max-w-2xl rounded-none border p-0">
        <DialogTitle className="sr-only">Comprobante de Egreso {number}</DialogTitle>
        <DialogDescription className="sr-only">
          Comprobante de egreso número {number} para {live.contractorName}
        </DialogDescription>

        <div className="flex justify-end gap-2 border-b py-3 pl-6 pr-14 print:hidden">
          {saving && <span className="self-center text-xs text-muted-foreground">Guardando…</span>}
          <button
            onClick={() => setDelConfirm(true)}
            disabled={deleting}
            className="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:hover:bg-red-950/40"
          >
            {deleting ? "Borrando…" : "Borrar"}
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="rounded border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            {downloading ? "Generando PDF…" : "Descargar PDF"}
          </button>
        </div>

        <div>
          <div className="ev-doc">
            <style>{VOUCHER_CSS}</style>

            <div className="ev-head">
              <div className="ev-building">{BUILDING_NAME}</div>
              <div>NIT: {NIT}</div>
              <div className="ev-italic">{ADDRESS}</div>
              <div className="ev-italic">{CITY}</div>
            </div>

            <div className="ev-titlebar">
              <span className="tt">Comprobante de Egreso</span>
              <span className="nn">
                Número:
                {editingField === "number" ? (
                  <input
                    autoFocus
                    type="number"
                    min={1}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitEdit("number", draft)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commitEdit("number", draft) }
                      if (e.key === "Escape") { e.preventDefault(); cancelEdit() }
                    }}
                    style={{ font: "inherit", fontWeight: "bold", border: "1px solid #1f3864", borderRadius: 2, padding: "0 4px", width: "72px", marginLeft: "70px", background: "#fff", textAlign: "center" }}
                  />
                ) : (
                  <b
                    style={{ marginLeft: "70px", cursor: saving ? "wait" : "text", borderRadius: 2, padding: "0 2px" }}
                    onDoubleClick={() => !saving && startEdit("number", String(live.number))}
                    title="Doble clic para editar"
                  >
                    {number}
                  </b>
                )}
              </span>
            </div>

            <div className="ev-sect">
              <div className="ev-bar">Pagado A</div>
              <div className="ev-info">
                <div className="ln"><span className="k">Nombre</span>{contractorSelectSpan()}</div>
                <div className="ln"><span className="k">C.C o NIT</span><span className="v">{live.contractorIdNumber}</span></div>
                <div className="ln"><span className="k">Fecha</span>{editableDateSpan()}</div>
              </div>
            </div>

            <div className="ev-sect">
              <table className="ev-t">
                <colgroup>
                  <col />
                  <col style={{ width: "120px" }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="ev-navy">Por Concepto De:</td>
                    <td className="ev-navy ev-r">Valor</td>
                  </tr>
                  <tr>
                    <td>{editableSpan("concept", live.concept)}</td>
                    <td className="ev-r">{editableAmountSpan()}</td>
                  </tr>
                  <tr><td>&nbsp;</td><td>&nbsp;</td></tr>
                  <tr><td>&nbsp;</td><td>&nbsp;</td></tr>
                  <tr>
                    <td className="ev-r ev-b">TOTAL</td>
                    <td className="ev-r ev-b">{amountFormatted}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="ev-footer">
              <div className="pay">
                <span className="ev-b">Forma de Pago: </span>{paymentAccountSelectSpan()}
              </div>
              <div className="ev-sign">
                <div className="top">Firma Beneficiario</div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={delConfirm} onOpenChange={setDelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Borrar comprobante N° {number}</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer y el número no se reutilizará.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={runDelete}
              className="bg-red-600 hover:bg-red-700 focus-visible:ring-red-600"
            >
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
