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
import { generateInvoiceDocument, getInvoiceLiveData, updateInvoice, updateInvoiceNumber, unlinkEgreso, type InvoiceData } from "./actions"
import type { ContractorData } from "../contractors/actions"

const BUILDING_NAME = "EDIFICIO CORDILLERA - PROPIEDAD HORIZONTAL"
const NIT = "902000058-9"
const ADDRESS = "Carrera 24 # 64A-41"
const CITY = "Manizales, Caldas - Colombia"

// Por ley, la retención en la fuente solo puede ser 4% o 6%.
// Kept in sync with VALID_RETENTION_RATES in actions.ts.
const RETENTION_RATE_OPTIONS = [4, 6]

const DOC_CSS = `
  .iv-doc { font-family: Arial, sans-serif; font-size: 11px; color: #000; padding: 24px; border: 1px solid #8c8c8c; }
  .iv-doc * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .iv-head { text-align: center; line-height: 1.45; }
  .iv-building { font-size: 15px; font-weight: bold; color: #1f3864; text-transform: uppercase; letter-spacing: .3px; }
  .iv-italic { font-style: italic; }
  .iv-titlebar { display: flex; justify-content: space-between; align-items: baseline; border-top: 1.5px solid #1f3864; border-bottom: 1.5px solid #1f3864; padding: 7px 2px; margin-top: 8px; }
  .iv-titlebar .tt { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
  .iv-titlebar .nn { font-size: 12px; font-weight: bold; }
  .iv-titlebar .nn b { margin-left: 70px; }
  .iv-sect { margin-top: 12px; }
  .iv-bar { background: #dde3f0; font-weight: bold; text-transform: uppercase; padding: 4px 8px; border: 1px solid #8c8c8c; }
  .iv-info { border: 1px solid #8c8c8c; border-top: none; padding: 4px 8px; }
  .iv-info .ln { display: flex; padding: 2px 0; }
  .iv-info .k { width: 120px; font-weight: bold; text-transform: uppercase; }
  .iv-info .v { flex: 1; }
  table.iv-t { width: 100%; border-collapse: collapse; }
  table.iv-t td { border: 1px solid #8c8c8c; padding: 4px 8px; vertical-align: top; }
  .iv-navy { background: #1f3864; color: #fff; font-weight: bold; text-transform: uppercase; letter-spacing: .3px; }
  .iv-r { text-align: right; }
  .iv-b { font-weight: bold; }
  .iv-summary { display: flex; justify-content: space-between; gap: 16px; margin-top: 10px; border: 1px solid #8c8c8c; padding: 6px 10px; }
  .iv-summary .lbl { font-size: 9px; color: #555; }
  .iv-summary .val { font-weight: bold; }
  .iv-footer { margin-top: 16px; border: 1px solid #8c8c8c; padding: 8px 10px; }
`

function formatInvoiceDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  const date = new Date(y, m - 1, d)
  const month = date.toLocaleDateString("es-CO", { month: "long" })
  const monthCapitalized = month.charAt(0).toUpperCase() + month.slice(1)
  return `${d} de ${monthCapitalized} del ${y}`
}

function formatCurrency(value: string | number) {
  return Number(value).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

interface Props {
  invoice: InvoiceData | null
  open: boolean
  onClose: () => void
  onDeleted?: () => void
  contractors: ContractorData[]
  // When set, shows a "Borrar" button that unlinks this one accounting record from the
  // invoice (not a real delete of the cuenta de cobro) — used when this modal is opened
  // from a specific Contabilidad row.
  linkedAccountingRecordId?: string | null
}

export function InvoiceDocumentModal({ invoice, open, onClose, onDeleted, contractors, linkedAccountingRecordId }: Props) {
  const [live, setLive] = useState<InvoiceData | null>(null)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [delConfirm, setDelConfirm] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !invoice) return
    setLive(invoice)
    if (invoice.number == null) {
      generateInvoiceDocument(invoice.id).then((res) => {
        if (res.invoice) setLive(res.invoice)
        else if (res.error) toast.error(res.error)
      })
    }
  }, [open, invoice])

  if (!live) return null

  const number = String(live.number ?? "…").padStart(4, "0")
  const totalFormatted = `$${formatCurrency(live.totalAmount)}`
  const netFormatted = `$${formatCurrency(live.netAmount)}`

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

    // Invoice number has its own action with uniqueness check
    if (field === "number") {
      const n = parseInt(trimmed, 10)
      if (isNaN(n) || n < 1 || String(n) !== trimmed) { cancelEdit(); return }
      if (n === live.number) { cancelEdit(); return }
      setSaving(true)
      setEditingField(null)
      try {
        const res = await updateInvoiceNumber(live.id, n)
        if (res.error) {
          toast.error(res.error)
        } else {
          const fresh = await getInvoiceLiveData(live.id)
          if (fresh) setLive(fresh)
        }
      } catch {
        toast.error("No se pudo actualizar el número.")
      } finally {
        setSaving(false)
      }
      return
    }

    let payload: Parameters<typeof updateInvoice>[1]
    switch (field) {
      case "contractorId":
        if (!trimmed || trimmed === live.contractorId) { cancelEdit(); return }
        payload = { contractorId: trimmed }
        break
      case "date":
        payload = { date: trimmed }
        break
      case "concept":
        if (!trimmed) { cancelEdit(); return }
        payload = { concept: trimmed }
        break
      case "totalAmount": {
        const n = parseFloat(trimmed)
        if (isNaN(n) || n <= 0) { cancelEdit(); return }
        payload = { totalAmount: n }
        break
      }
      case "retentionRate":
        payload = { retentionRate: trimmed === "" ? null : parseFloat(trimmed) }
        break
      case "bankInfo":
        payload = { bankInfo: trimmed || null }
        break
      case "notes":
        payload = { notes: trimmed || null }
        break
      default:
        cancelEdit()
        return
    }

    setSaving(true)
    setEditingField(null)
    try {
      const res = await updateInvoice(live.id, payload)
      if (res.error) {
        toast.error(res.error)
      } else {
        const fresh = await getInvoiceLiveData(live.id)
        if (fresh) setLive(fresh)
      }
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
        {formatInvoiceDate(live.date)}
      </span>
    )
  )

  const editableAmountSpan = () => (
    editingField === "totalAmount" ? (
      <input
        ref={inputRef}
        autoFocus
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitEdit("totalAmount", draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commitEdit("totalAmount", draft) }
          if (e.key === "Escape") { e.preventDefault(); cancelEdit() }
        }}
        style={{ font: "inherit", border: "1px solid #1f3864", borderRadius: 2, padding: "0 4px", width: "100px", textAlign: "right", background: "#fff" }}
      />
    ) : (
      <span
        className="iv-r"
        style={{ cursor: saving ? "wait" : "text", borderRadius: 2, padding: "0 2px" }}
        onDoubleClick={() => !saving && startEdit("totalAmount", live.totalAmount)}
        title="Doble clic para editar"
      >
        {totalFormatted}
      </span>
    )
  )

  const contractorSelectSpan = () => (
    editingField === "contractorId" ? (
      <select
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitEdit("contractorId", draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commitEdit("contractorId", draft) }
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
        onDoubleClick={() => !saving && startEdit("contractorId", live.contractorId)}
        title="Doble clic para editar"
      >
        {live.contractorName}
      </span>
    )
  )

  const retentionSelectSpan = () => (
    editingField === "retentionRate" ? (
      <select
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitEdit("retentionRate", draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commitEdit("retentionRate", draft) }
          if (e.key === "Escape") { e.preventDefault(); cancelEdit() }
        }}
        style={{ font: "inherit", border: "1px solid #1f3864", borderRadius: 2, padding: "0 4px", background: "#fff", width: "100%" }}
      >
        <option value="">— Sin retención —</option>
        {RETENTION_RATE_OPTIONS.map((rate) => (
          <option key={rate} value={rate}>{rate}%</option>
        ))}
      </select>
    ) : (
      <span
        style={{ cursor: saving ? "wait" : "text", borderRadius: 2, padding: "0 2px", color: live.retentionRate == null ? "#888" : undefined, fontStyle: live.retentionRate == null ? "italic" : undefined }}
        onDoubleClick={() => !saving && startEdit("retentionRate", live.retentionRate != null ? String(live.retentionRate) : "")}
        title="Doble clic para editar"
      >
        {live.retentionRate != null ? `Retención en la fuente ${live.retentionRate}%` : "— Sin retención (doble clic para agregar) —"}
      </span>
    )
  )

  const handleDownloadPdf = async () => {
    if (!live || live.number == null || downloading) return
    setDownloading(true)
    try {
      const { generateInvoiceBlob } = await import("./invoice-pdf")
      const blob = await generateInvoiceBlob(live)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `Cuenta-Cobro-${number}.pdf`
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
    if (!linkedAccountingRecordId || deleting) return
    setDeleting(true)
    unlinkEgreso(linkedAccountingRecordId)
      .then((res) => {
        if (res.error) {
          toast.error(res.error)
        } else {
          onDeleted?.()
          toast.success("Egreso desligado de la cuenta de cobro.")
        }
      })
      .finally(() => setDeleting(false))
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="w-full max-w-2xl rounded-none border p-0">
        <DialogTitle className="sr-only">Cuenta de Cobro {number}</DialogTitle>
        <DialogDescription className="sr-only">
          Cuenta de cobro número {number} de {live.contractorName}
        </DialogDescription>

        <div className="flex justify-end gap-2 border-b py-3 pl-6 pr-14 print:hidden">
          {saving && <span className="self-center text-xs text-muted-foreground">Guardando…</span>}
          {linkedAccountingRecordId && (
            <button
              onClick={() => setDelConfirm(true)}
              disabled={deleting}
              className="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:hover:bg-red-950/40"
            >
              {deleting ? "Borrando…" : "Borrar"}
            </button>
          )}
          <button
            onClick={handleDownloadPdf}
            disabled={downloading || live.number == null}
            className="rounded border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            {downloading ? "Generando PDF…" : "Descargar PDF"}
          </button>
        </div>

        <div>
          <div className="iv-doc">
            <style>{DOC_CSS}</style>

            <div className="iv-head">
              <div className="iv-building">{BUILDING_NAME}</div>
              <div>NIT: {NIT}</div>
              <div className="iv-italic">{ADDRESS}</div>
              <div className="iv-italic">{CITY}</div>
            </div>

            <div className="iv-titlebar">
              <span className="tt">Cuenta de Cobro</span>
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
                    style={{ marginLeft: "70px", cursor: live.number == null ? "default" : saving ? "wait" : "text", borderRadius: 2, padding: "0 2px" }}
                    onDoubleClick={() => !saving && live.number != null && startEdit("number", String(live.number))}
                    title={live.number != null ? "Doble clic para editar" : undefined}
                  >
                    {number}
                  </b>
                )}
              </span>
            </div>

            <div className="iv-sect">
              <div className="iv-bar">Cobrado Por</div>
              <div className="iv-info">
                <div className="ln"><span className="k">Nombre</span>{contractorSelectSpan()}</div>
                <div className="ln"><span className="k">C.C o NIT</span><span className="v">{live.contractorIdNumber}</span></div>
                <div className="ln"><span className="k">Fecha</span>{editableDateSpan()}</div>
              </div>
            </div>

            <div className="iv-sect">
              <table className="iv-t">
                <colgroup>
                  <col />
                  <col style={{ width: "120px" }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="iv-navy">Por Concepto De:</td>
                    <td className="iv-navy iv-r">Valor</td>
                  </tr>
                  <tr>
                    <td>{editableSpan("concept", live.concept)}</td>
                    <td className="iv-r">{editableAmountSpan()}</td>
                  </tr>
                  <tr>
                    <td>{retentionSelectSpan()}</td>
                    <td className="iv-r">{live.retentionRate != null ? `$${formatCurrency(live.retentionAmount)}` : " "}</td>
                  </tr>
                  <tr>
                    <td className="iv-r iv-b">{live.retentionRate != null ? "NETO A PAGAR" : "TOTAL"}</td>
                    <td className="iv-r iv-b">{live.retentionRate != null ? netFormatted : totalFormatted}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="iv-summary">
              <div>
                <div className="lbl">Total cuenta de cobro</div>
                <div>{totalFormatted}</div>
              </div>
              <div>
                <div className="lbl">Abonado</div>
                <div>${formatCurrency(live.paid)}</div>
              </div>
              <div>
                <div className="lbl">Saldo pendiente</div>
                <div className="val">${formatCurrency(live.pending)}</div>
              </div>
            </div>

            {live.abonos.length > 0 && (
              <div className="iv-sect">
                <div className="iv-bar">Abonos</div>
                <table className="iv-t">
                  <colgroup>
                    <col style={{ width: "110px" }} />
                    <col style={{ width: "110px" }} />
                    <col />
                  </colgroup>
                  <tbody>
                    <tr>
                      <td className="iv-navy">Fecha</td>
                      <td className="iv-navy">Comprobante</td>
                      <td className="iv-navy iv-r">Monto</td>
                    </tr>
                    {live.abonos.map((a) => (
                      <tr key={a.id}>
                        <td>{formatInvoiceDate(a.date)}</td>
                        <td>{a.voucherNumber != null ? String(a.voucherNumber).padStart(4, "0") : "—"}</td>
                        <td className="iv-r">${formatCurrency(a.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="iv-footer">
              <div><b>Datos bancarios: </b>{editableSpan("bankInfo", live.bankInfo ?? "")}</div>
              <div style={{ marginTop: 4 }}><b>Notas: </b>{editableSpan("notes", live.notes ?? "")}</div>
            </div>
          </div>
        </div>
      </DialogContent>

      {linkedAccountingRecordId && (
        <AlertDialog open={delConfirm} onOpenChange={setDelConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Desligar de la cuenta de cobro</AlertDialogTitle>
              <AlertDialogDescription>
                El egreso dejará de estar ligado a la cuenta de cobro N° {number}. La cuenta de cobro en sí no se borra.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={runDelete}
                className="bg-red-600 hover:bg-red-700 focus-visible:ring-red-600"
              >
                Desligar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Dialog>
  )
}
