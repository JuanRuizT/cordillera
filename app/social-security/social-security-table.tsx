"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import {
  deleteSocialSecurityPayment,
  uploadSocialSecurityDocument,
  deleteSocialSecurityDocument,
  updateSocialSecurityPayment,
} from "./actions"
import { periodLabel, type SocialSecurityData, type SocialSecurityStatus } from "@/lib/social-security/document-data"
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { EditSocialSecurityDialog } from "./edit-dialog"
import { AlertTriangle, Download, Eye, Loader2, MoreHorizontal, Paperclip, Pencil, Trash2, X } from "lucide-react"

function money(v: string | number) {
  const n = Number(v)
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })
}

function isImageFile(fileName: string | null) {
  return /\.(jpe?g|png)$/i.test(fileName ?? "")
}

function monthsBetween(start: string, end: string): string[] {
  const out: string[] = []
  let [y, m] = start.split("-").map(Number)
  const [ey, em] = end.split("-").map(Number)
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}

const STATUS_BADGES: Record<SocialSecurityStatus, { label: string; className: string }> = {
  pagada: { label: "Pagada", className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" },
  parcial: { label: "Parcial", className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  pendiente: { label: "Pendiente", className: "bg-muted text-muted-foreground" },
}

type InlineField = "expectedAmount" | "notes"

interface Props {
  entries: SocialSecurityData[]
  currentMonth: string
}

export function SocialSecurityTable({ entries, currentMonth }: Props) {
  const [, startTransition] = useTransition()
  const [toEdit, setToEdit] = useState<SocialSecurityData | null>(null)
  const [toDelete, setToDelete] = useState<SocialSecurityData | null>(null)
  const [preview, setPreview] = useState<SocialSecurityData | null>(null)
  const [editing, setEditing] = useState<{ id: string; field: InlineField; original: string } | null>(null)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  // Which entry the hidden file input's next selection uploads to — set right before opening it.
  const [uploadTarget, setUploadTarget] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Months since the first planilla that still have none. A planilla for a month is usually paid in
  // the next one, so the current month only counts once it's over.
  const planillaPeriods = new Set(entries.filter((e) => e.kind === "planilla" && e.period).map((e) => e.period!))
  const firstPeriod = [...planillaPeriods].sort()[0]
  const [cy, cm] = currentMonth.split("-").map(Number)
  const lastDueMonth = cm === 1 ? `${cy - 1}-12` : `${cy}-${String(cm - 1).padStart(2, "0")}`
  const missingMonths = firstPeriod && firstPeriod <= lastDueMonth
    ? monthsBetween(firstPeriod, lastDueMonth).filter((m) => !planillaPeriods.has(m))
    : []

  const totals = entries.reduce(
    (t, e) => ({ expected: t.expected + Number(e.expectedAmount), paid: t.paid + Number(e.paidAmount) }),
    { expected: 0, paid: 0 }
  )

  const startEdit = (e: SocialSecurityData, field: InlineField) => {
    const value = field === "expectedAmount" ? e.expectedAmount : (e.notes ?? "")
    setEditing({ id: e.id, field, original: value })
    setDraft(value)
  }
  const cancelEdit = () => { setEditing(null); setDraft("") }

  const commitEdit = async () => {
    if (!editing || saving) return
    const { id, field, original } = editing
    const value = draft.trim()
    if (value === original.trim()) { cancelEdit(); return }
    let payload: Parameters<typeof updateSocialSecurityPayment>[1]
    if (field === "expectedAmount") {
      const n = parseFloat(value)
      if (isNaN(n) || n <= 0) { toast.error("El valor esperado debe ser mayor a 0."); cancelEdit(); return }
      payload = { expectedAmount: n }
    } else {
      payload = { notes: value || null }
    }
    setSaving(true)
    const res = await updateSocialSecurityPayment(id, payload)
    setSaving(false)
    if (res.error) toast.error(res.error)
    else toast.success("Guardado.")
    cancelEdit()
  }

  // Render helper — NOT a component, so the input isn't remounted (losing focus) on every keystroke.
  const cellContent = (e: SocialSecurityData, field: InlineField, display: React.ReactNode) => {
    if (editing?.id !== e.id || editing.field !== field) return display
    return (
      <input
        autoFocus
        type={field === "expectedAmount" ? "number" : "text"}
        min={field === "expectedAmount" ? "0" : undefined}
        value={draft}
        onChange={(ev) => setDraft(ev.target.value)}
        onBlur={commitEdit}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") { ev.preventDefault(); commitEdit() }
          if (ev.key === "Escape") cancelEdit()
        }}
        disabled={saving}
        className={`h-7 rounded border border-primary bg-background px-1 text-sm ${field === "expectedAmount" ? "w-28 text-right" : "w-full"}`}
      />
    )
  }

  const handleDocumentClick = (e: SocialSecurityData) => {
    if (e.fileUrl) { setPreview(e); return }
    setUploadTarget(e.id)
    fileInputRef.current?.click()
  }

  const handleFileChange = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0]
    const id = uploadTarget
    ev.target.value = ""
    setUploadTarget(null)
    if (!file || !id) return
    setUploadingId(id)
    startTransition(async () => {
      const fd = new FormData()
      fd.append("file", file)
      const res = await uploadSocialSecurityDocument(id, fd)
      setUploadingId(null)
      if (res.error) toast.error(res.error)
      else toast.success("Planilla subida.")
    })
  }

  const removeDocument = (e: SocialSecurityData) => {
    startTransition(async () => {
      const res = await deleteSocialSecurityDocument(e.id)
      if (res.error) toast.error(res.error)
      else toast.success("Planilla quitada.")
    })
  }

  const confirmDelete = () => {
    const e = toDelete
    setToDelete(null)
    if (!e) return
    startTransition(async () => {
      const res = await deleteSocialSecurityPayment(e.id)
      if (res.error) toast.error(res.error)
      else toast.success("Eliminado. Los pagos de Contabilidad quedaron sin vincular.")
    })
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
        Todavía no hay planillas. Usa &quot;Nueva planilla&quot; para subir la primera.
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 gap-3">
      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} />

      {missingMonths.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Meses sin planilla: {missingMonths.map(periodLabel).join(", ")}.</span>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto rounded-md border">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted text-left">
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Periodo</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">N.° planilla</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Fecha pago planilla</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap text-right">Esperado</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap text-right">Pagado</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap text-right">Pendiente</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap text-center">Estado</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap text-right">Total planilla</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap text-center">PDF</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Pagos en Contabilidad</th>
              <th className="px-4 py-3 font-semibold">Notas</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const pending = Number(e.pendingAmount)
              const pendingClass = pending > 0 ? " font-medium text-amber-600 dark:text-amber-400" : pending < 0 ? " font-medium text-blue-600 dark:text-blue-400" : " text-muted-foreground"
              const badge = STATUS_BADGES[e.status]
              const breakdown = [
                e.pensionAmount != null && `Pensión ${money(e.pensionAmount)}`,
                e.healthAmount != null && `Salud ${money(e.healthAmount)}`,
                e.riskAmount != null && `Riesgos ${money(e.riskAmount)}`,
                e.compensationFundAmount != null && `Caja ${money(e.compensationFundAmount)}`,
              ].filter(Boolean).join(" · ")
              return (
                <tr
                  key={e.id}
                  className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}
                  onDoubleClick={(ev) => {
                    const target = ev.target as HTMLElement
                    if (!ev.currentTarget.contains(target)) return
                    if (target.closest("[data-inline-edit], button, a, input, select, textarea, label")) return
                    setToEdit(e)
                  }}
                >
                  <td className="px-4 py-3 whitespace-nowrap font-medium">
                    {e.label}
                    {e.affiliateName && <div className="text-xs font-normal text-muted-foreground">{e.affiliateName}</div>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">{e.planillaNumber ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{e.paidDate ? formatDate(e.paidDate) : "—"}</td>
                  <td
                    data-inline-edit
                    className="px-4 py-3 text-right whitespace-nowrap tabular-nums"
                    onDoubleClick={() => startEdit(e, "expectedAmount")}
                    title="Doble clic para editar"
                  >
                    {cellContent(e, "expectedAmount", money(e.expectedAmount))}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">{money(e.paidAmount)}</td>
                  <td
                    className={`px-4 py-3 text-right whitespace-nowrap tabular-nums${pendingClass}`}
                    title={`Esperado ${money(e.expectedAmount)} − pagado ${money(e.paidAmount)}${pending < 0 ? " (se pagó de más)" : ""}`}
                  >
                    {money(e.pendingAmount)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums text-muted-foreground" title={breakdown || undefined}>
                    {e.planillaTotal != null ? money(e.planillaTotal) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleDocumentClick(e)}
                      disabled={uploadingId === e.id}
                      title={e.fileUrl ? "Ver planilla" : "Adjuntar planilla"}
                      className="mx-auto flex items-center justify-center disabled:opacity-50"
                    >
                      {uploadingId === e.id
                        ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        : e.fileUrl
                          ? <Eye className="h-4 w-4 text-blue-600 hover:text-blue-700" />
                          : <Paperclip className="h-4 w-4 text-muted-foreground hover:text-foreground" />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {e.payments.length === 0 ? (
                      <span className="text-muted-foreground" title="Vincúlalos desde Contabilidad, columna Seguridad Social">—</span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {e.payments.map((p) => (
                          <a
                            key={p.id}
                            href={`/accounting#record-${p.id}`}
                            title={`${p.concept} — ver en Contabilidad`}
                            className="whitespace-nowrap text-xs text-blue-600 hover:underline dark:text-blue-400"
                          >
                            {formatDate(p.date)} · {money(p.amount)}
                          </a>
                        ))}
                      </div>
                    )}
                  </td>
                  <td
                    data-inline-edit
                    className="px-4 py-3 max-w-xs truncate text-muted-foreground"
                    onDoubleClick={() => startEdit(e, "notes")}
                    title={e.notes || "Doble clic para editar"}
                  >
                    {cellContent(e, "notes", e.notes ?? "—")}
                  </td>
                  <td className="px-4 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="text-muted-foreground hover:text-primary" title="Acciones">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setToEdit(e)}>
                          <Pencil className="h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        {e.fileUrl && (
                          <DropdownMenuItem onSelect={() => removeDocument(e)}>
                            <X className="h-4 w-4" />
                            Quitar planilla (PDF)
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setToDelete(e)} className="text-destructive focus:text-destructive">
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
          <tfoot className="sticky bottom-0 bg-muted font-semibold">
            <tr>
              <td className="px-4 py-3" colSpan={3}>Total</td>
              <td className="px-4 py-3 text-right tabular-nums">{money(totals.expected)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{money(totals.paid)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{money(Math.round((totals.expected - totals.paid) * 100) / 100)}</td>
              <td colSpan={6} />
            </tr>
          </tfoot>
        </table>
      </div>

      {toEdit && <EditSocialSecurityDialog key={toEdit.id} entry={toEdit} onClose={() => setToEdit(null)} />}

      <Dialog open={preview !== null} onOpenChange={(v) => { if (!v) setPreview(null) }}>
        <DialogContent className="w-full max-w-4xl gap-0 p-0">
          <div className="flex items-center justify-between border-b py-2 pl-4 pr-12">
            <DialogTitle className="text-sm font-medium">Planilla — {preview?.label}</DialogTitle>
            {preview && (
              <a
                href={`/api/social-security/${preview.id}/document`}
                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5" /> Descargar
              </a>
            )}
          </div>
          <DialogDescription className="sr-only">Previsualización de la planilla</DialogDescription>
          {preview && (
            isImageFile(preview.fileName) ? (
              <div className="flex h-[80vh] w-full items-center justify-center overflow-auto bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/social-security/${preview.id}/document`} alt="Planilla" className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              <iframe src={`/api/social-security/${preview.id}/document`} title="Planilla" className="h-[80vh] w-full" />
            )
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete !== null} onOpenChange={(v) => { if (!v) setToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar {toDelete?.label}</AlertDialogTitle>
            <AlertDialogDescription>
              Se elimina el registro y su PDF. Los {toDelete?.payments.length ?? 0} pagos vinculados de Contabilidad no se
              borran: quedan sin vincular.
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
