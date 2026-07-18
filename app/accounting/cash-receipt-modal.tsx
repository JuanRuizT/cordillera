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
  deleteCashReceipt,
  getAdminSignatureDataUrl,
  updateAccountingRecord,
  updateCashReceiptNumber,
  updateCashReceiptAmount,
  updateCashReceiptConcept,
  getCashReceiptLiveData,
  type CashReceiptData,
} from "./actions"

const BUILDING_NAME = "EDIFICIO CORDILLERA - PROPIEDAD HORIZONTAL"
const NIT = "902000058-9"
const ADDRESS = "Carrera 24 # 64A-41"
const CITY = "Manizales, Caldas - Colombia"


// Self-contained styles, scoped to .rc-doc, so the receipt renders identically
// on screen and inside the print popup (which does not load Tailwind).
const RECEIPT_CSS = `
  .rc-doc { font-family: Arial, sans-serif; font-size: 11px; color: #000; padding: 24px; border: 1px solid #8c8c8c; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .rc-doc * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .rc-head { text-align: center; line-height: 1.45; }
  .rc-building { font-size: 15px; font-weight: bold; color: #1f3864; text-transform: uppercase; letter-spacing: .3px; }
  .rc-italic { font-style: italic; }
  .rc-titlebar { display: flex; justify-content: space-between; align-items: baseline; border-top: 1.5px solid #1f3864; border-bottom: 1.5px solid #1f3864; padding: 7px 2px; margin-top: 8px; }
  .rc-titlebar .tt { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
  .rc-titlebar .nn { font-size: 12px; font-weight: bold; }
  .rc-titlebar .nn b { margin-left: 70px; }
  .rc-sect { margin-top: 12px; }
  .rc-bar { background: #dde3f0; font-weight: bold; text-transform: uppercase; padding: 4px 8px; border: 1px solid #8c8c8c; }
  .rc-info { border: 1px solid #8c8c8c; border-top: none; padding: 4px 8px; }
  .rc-info .ln { display: flex; padding: 2px 0; }
  .rc-info .k { width: 120px; font-weight: bold; text-transform: uppercase; }
  .rc-info .v { flex: 1; }
  table.rc-t { width: 100%; border-collapse: collapse; }
  table.rc-t td { border: 1px solid #8c8c8c; padding: 4px 8px; vertical-align: top; }
  .rc-navy { background: #1f3864; color: #fff; font-weight: bold; text-transform: uppercase; letter-spacing: .3px; }
  .rc-r { text-align: right; }
  .rc-b { font-weight: bold; }
  .rc-bottom { display: flex; gap: 16px; margin-top: 12px; align-items: stretch; }
  .rc-bottom .col { flex: 1; display: flex; flex-direction: column; }
  table.rc-grid { width: 100%; border-collapse: collapse; }
  table.rc-grid th, table.rc-grid td { border: 1px solid #8c8c8c; padding: 4px 6px; text-align: center; font-size: 10px; }
  table.rc-grid th { font-weight: bold; text-transform: uppercase; }
  table.rc-grid td.rc-empty { height: 20px; }
  .rc-sign { margin-top: 18px; border: 1px solid #8c8c8c; flex: 1; display: flex; flex-direction: column; }
  .rc-sign .top { text-align: center; padding: 4px; }
  .rc-sign .space { flex: 1; min-height: 56px; display: flex; align-items: center; justify-content: center; }
  .rc-sign .space img { max-width: 170px; max-height: 60px; object-fit: contain; }
  .rc-sign .bottom { text-align: center; padding: 4px; font-weight: bold; border-top: 1px solid #8c8c8c; }
`

function formatReceiptDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  const date = new Date(y, m - 1, d)
  const month = date.toLocaleDateString("es-CO", { month: "long" })
  const monthCapitalized = month.charAt(0).toUpperCase() + month.slice(1)
  return `${monthCapitalized} ${d} del ${y}`
}

function formatCurrency(value: string | number) {
  return Number(value).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function capitalizeWords(str: string) {
  return str.replace(/\b\w/g, (c) => c.toUpperCase())
}

interface CashReceiptModalProps {
  receipt: CashReceiptData | null
  open: boolean
  onClose: () => void
  onDeleted?: () => void
  onOpenSplit?: (accountingRecordId: string) => void
  owners: Array<{ unit: string; name: string }>
}

export function CashReceiptModal({ receipt, open, onClose, onDeleted, onOpenSplit, owners }: CashReceiptModalProps) {
  const [live, setLive] = useState<CashReceiptData | null>(null)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [signature, setSignature] = useState<string | null>(null)
  const [delConfirm, setDelConfirm] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setLive(receipt) }, [receipt])

  // Load the admin signature (from GCS) once when the modal opens
  useEffect(() => {
    if (!open) return
    let active = true
    getAdminSignatureDataUrl().then((url) => { if (active) setSignature(url) })
    return () => { active = false }
  }, [open])

  if (!live) return null

  const receiptNumber = String(live.number).padStart(4, "0")
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

    // Receipt number has its own action with uniqueness check
    if (field === "number") {
      const n = parseInt(trimmed, 10)
      if (isNaN(n) || n < 1 || String(n) !== trimmed) { cancelEdit(); return }
      if (n === live.number) { cancelEdit(); return }
      setSaving(true)
      setEditingField(null)
      try {
        const res = await updateCashReceiptNumber(live.id, n)
        if (res.error) {
          toast.error(res.error)
        } else {
          const fresh = await getCashReceiptLiveData(live.id)
          if (fresh) setLive(fresh)
        }
      } catch {
        toast.error("No se pudo actualizar el número.")
      } finally {
        setSaving(false)
      }
      return
    }

    // Once a payment is split into several receipts, amount/concept are this receipt's own
    // override — they can no longer write through to the shared AccountingRecord (that would
    // silently change every sibling receipt's derived value too).
    if (live.siblingCount > 1 && (field === "amount" || field === "concept")) {
      if (!trimmed) { cancelEdit(); return }
      setSaving(true)
      setEditingField(null)
      try {
        const res = field === "amount"
          ? await updateCashReceiptAmount(live.id, trimmed)
          : await updateCashReceiptConcept(live.id, trimmed)
        if (res.error) {
          toast.error(res.error)
        } else {
          const fresh = await getCashReceiptLiveData(live.id)
          if (fresh) setLive(fresh)
        }
      } catch {
        toast.error("No se pudo guardar el cambio.")
      } finally {
        setSaving(false)
      }
      return
    }

    // Map modal field name → AccountingRecord field
    let recordField: string
    let recordValue: string
    switch (field) {
      case "property":
      case "unit":
        recordField = "property"
        recordValue = trimmed
        break
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
        recordField = live.isIncome ? "income" : "expenses"
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
      const fresh = await getCashReceiptLiveData(live.id)
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

  const editableDateSpan = (field: string, isoDate: string) => (
    editingField === field ? (
      <input
        ref={inputRef}
        autoFocus
        type="date"
        value={isoDate.slice(0, 10)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitEdit(field, draft || isoDate.slice(0, 10))}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commitEdit(field, draft || isoDate.slice(0, 10)) }
          if (e.key === "Escape") { e.preventDefault(); cancelEdit() }
        }}
        style={{ font: "inherit", border: "1px solid #1f3864", borderRadius: 2, padding: "0 4px", background: "#fff" }}
      />
    ) : (
      <span
        className="v"
        style={{ cursor: saving ? "wait" : "text", borderRadius: 2, padding: "0 2px" }}
        onDoubleClick={() => !saving && startEdit(field, isoDate.slice(0, 10))}
        title="Doble clic para editar"
      >
        {formatReceiptDate(isoDate)}
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
        className="rc-r rc-b"
        style={{ cursor: saving ? "wait" : "text", borderRadius: 2, padding: "0 2px" }}
        onDoubleClick={() => !saving && startEdit("amount", live.amount)}
        title="Doble clic para editar"
      >
        {amountFormatted}
      </span>
    )
  )

  const ownerSelectSpan = () => (
    editingField === "property" ? (
      <select
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitEdit("property", draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commitEdit("property", draft) }
          if (e.key === "Escape") { e.preventDefault(); cancelEdit() }
        }}
        style={{ font: "inherit", border: "1px solid #1f3864", borderRadius: 2, padding: "0 4px", background: "#fff", width: "100%" }}
      >
        <option value="">— Sin propietario —</option>
        {owners.map((o) => (
          <option key={o.unit} value={o.unit}>{o.unit} — {o.name}</option>
        ))}
      </select>
    ) : (
      <span
        className="v"
        style={{ cursor: saving ? "wait" : "text", textTransform: "uppercase", borderRadius: 2, padding: "0 2px" }}
        onDoubleClick={() => !saving && startEdit("property", live.unit)}
        title="Doble clic para editar"
      >
        {live.recipientName || "—"}
      </span>
    )
  )

  const unitSelectSpan = () => (
    editingField === "unit" ? (
      <select
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitEdit("unit", draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commitEdit("unit", draft) }
          if (e.key === "Escape") { e.preventDefault(); cancelEdit() }
        }}
        style={{ font: "inherit", border: "1px solid #1f3864", borderRadius: 2, padding: "0 4px", background: "#fff", width: "100%" }}
      >
        <option value="">— Sin inmueble —</option>
        {owners.map((o) => (
          <option key={o.unit} value={o.unit}>{o.unit} — {o.name}</option>
        ))}
      </select>
    ) : (
      <span
        className="v"
        style={{ cursor: saving ? "wait" : "text", borderRadius: 2, padding: "0 2px" }}
        onDoubleClick={() => !saving && startEdit("unit", live.unit)}
        title="Doble clic para editar"
      >
        {live.unit || "—"}
      </span>
    )
  )

  const handleDownloadPdf = async () => {
    if (!live || downloading) return
    setDownloading(true)
    try {
      const { generateReceiptBlob } = await import("./cash-receipt-pdf")
      const signatureDataUrl = signature ?? (await getAdminSignatureDataUrl())
      const blob = await generateReceiptBlob(live, signatureDataUrl)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `Recibo-${receiptNumber}.pdf`
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
    deleteCashReceipt(live.id)
      .then((res) => {
        if (res.error) {
          toast.error(res.error)
        } else {
          onDeleted?.()
          toast.success(`Recibo N° ${receiptNumber} borrado.`)
        }
      })
      .finally(() => setDeleting(false))
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="w-full max-w-2xl rounded-none border p-0">
        <DialogTitle className="sr-only">Recibo de Caja {receiptNumber}</DialogTitle>
        <DialogDescription className="sr-only">
          Recibo de caja número {receiptNumber} para {live.recipientName}
        </DialogDescription>

        <div className="flex justify-end gap-2 border-b py-3 pl-6 pr-14 print:hidden">
          {saving && <span className="self-center text-xs text-muted-foreground">Guardando…</span>}
          {onOpenSplit && (
            <button
              onClick={() => onOpenSplit(live.accountingRecordId)}
              className="rounded border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              {live.siblingCount > 1 ? `Ver los ${live.siblingCount} recibos de este pago` : "Dividir en varios recibos"}
            </button>
          )}
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
          <div className="rc-doc">
            <style>{RECEIPT_CSS}</style>

            {/* Header */}
            <div className="rc-head">
              <div className="rc-building">{BUILDING_NAME}</div>
              <div>NIT: {NIT}</div>
              <div className="rc-italic">{ADDRESS}</div>
              <div className="rc-italic">{CITY}</div>
            </div>

            {/* Title + number */}
            <div className="rc-titlebar">
              <span className="tt">Recibo de Caja</span>
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
                    {receiptNumber}
                  </b>
                )}
              </span>
            </div>

            {/* Recibido de */}
            <div className="rc-sect">
              <div className="rc-bar">Recibido De</div>
              <div className="rc-info">
                <div className="ln">
                  <span className="k">Nombre</span>
                  {ownerSelectSpan()}
                </div>
                <div className="ln">
                  <span className="k">Inmueble</span>
                  {unitSelectSpan()}
                </div>
                <div className="ln">
                  <span className="k">Fecha</span>
                  {editableDateSpan("date", live.date)}
                </div>
              </div>
            </div>

            {/* Concepto + valor + letras */}
            <div className="rc-sect">
              <table className="rc-t">
                <colgroup>
                  <col style={{ width: "120px" }} />
                  <col />
                  <col style={{ width: "120px" }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="rc-navy" colSpan={2}>Por Concepto De:</td>
                    <td className="rc-navy rc-r">Valor Neto</td>
                  </tr>
                  <tr>
                    <td colSpan={2}>{editableSpan("concept", live.concept)}</td>
                    <td className="rc-r rc-b">{editableAmountSpan()}</td>
                  </tr>
                  <tr>
                    <td colSpan={2}>&nbsp;</td>
                    <td>&nbsp;</td>
                  </tr>
                  <tr>
                    <td colSpan={2}>&nbsp;</td>
                    <td>&nbsp;</td>
                  </tr>
                  <tr>
                    <td className="rc-b" style={{ textTransform: "uppercase", whiteSpace: "nowrap" }}>Valor en Letras</td>
                    <td>{capitalizeWords(live.amountInWords)}</td>
                    <td>&nbsp;</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Bottom: accounting grid + payment/signature */}
            <div className="rc-bottom">
              <div className="col">
                <table className="rc-grid">
                  <thead>
                    <tr>
                      <th>Cod. Cta</th>
                      <th>Débito</th>
                      <th>Crédito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        <td className="rc-empty">&nbsp;</td>
                        <td className="rc-empty">&nbsp;</td>
                        <td className="rc-empty">&nbsp;</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="col">
                <table className="rc-grid">
                  <tbody>
                    <tr>
                      <td className="rc-empty">&nbsp;</td>
                      <td className="rc-empty">&nbsp;</td>
                      <td className="rc-r" style={{ width: "54px" }}>&nbsp;</td>
                    </tr>
                    <tr>
                      <td className="rc-empty">&nbsp;</td>
                      <td className="rc-empty">&nbsp;</td>
                      <td className="rc-r">&nbsp;</td>
                    </tr>
                    <tr>
                      <td
                        className="rc-b"
                        colSpan={2}
                        style={{ textAlign: "left", textTransform: "uppercase", padding: "4px 8px" }}
                      >
                        {live.paymentMethod}
                      </td>
                      <td className="rc-r rc-b">{amountFormatted}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="rc-sign">
                  <div className="top">Firma y Sello</div>
                  <div className="space">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {signature ? <img src={signature} alt="Firma" /> : " "}
                  </div>
                  <div className="bottom">Administrador</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={delConfirm} onOpenChange={setDelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Borrar recibo N° {receiptNumber}</AlertDialogTitle>
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
