"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { createSocialSecurityPayment, extractSocialSecurityFromFile } from "./actions"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Plus } from "lucide-react"

// Values only the AI fills in (read off the planilla), sent along with the form but not edited here.
type Breakdown = { pensionAmount: string; healthAmount: string; riskAmount: string; compensationFundAmount: string }
const EMPTY_BREAKDOWN: Breakdown = { pensionAmount: "", healthAmount: "", riskAmount: "", compensationFundAmount: "" }

export function AddSocialSecurityForm({ defaultExpected }: { defaultExpected: number }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<"planilla" | "inscripcion">("planilla")
  const [period, setPeriod] = useState("")
  const [expectedAmount, setExpectedAmount] = useState(String(defaultExpected))
  const [planillaNumber, setPlanillaNumber] = useState("")
  const [planillaTotal, setPlanillaTotal] = useState("")
  const [paidDate, setPaidDate] = useState("")
  const [affiliateName, setAffiliateName] = useState("")
  const [affiliateIdNumber, setAffiliateIdNumber] = useState("")
  const [notes, setNotes] = useState("")
  const [breakdown, setBreakdown] = useState<Breakdown>(EMPTY_BREAKDOWN)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractionNote, setExtractionNote] = useState<{ type: "ok" | "warn"; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function resetForm() {
    setKind("planilla")
    setPeriod("")
    setExpectedAmount(String(defaultExpected))
    setPlanillaNumber("")
    setPlanillaTotal("")
    setPaidDate("")
    setAffiliateName("")
    setAffiliateIdNumber("")
    setNotes("")
    setBreakdown(EMPTY_BREAKDOWN)
    setError(null)
    setExtractionNote(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function handleExtract() {
    const file = fileInputRef.current?.files?.[0]
    if (!file) { toast.error("Selecciona la planilla primero."); return }
    setExtracting(true)
    setExtractionNote(null)
    try {
      const fd = new FormData()
      fd.set("file", file)
      const res = await extractSocialSecurityFromFile(fd)
      if (!res.ok) { toast.error(res.error ?? "No se pudo leer la planilla."); return }
      if (!res.isPlanilla) {
        setExtractionNote({
          type: "warn",
          text: `Este archivo no parece una planilla de seguridad social${res.documentKind ? ` (parece: ${res.documentKind})` : ""}. No se llenó ningún campo.`,
        })
        return
      }

      setKind("planilla")
      if (res.period) setPeriod(res.period)
      if (res.planillaNumber) setPlanillaNumber(res.planillaNumber)
      if (res.planillaTotal) setPlanillaTotal(res.planillaTotal)
      if (res.paidDate) setPaidDate(res.paidDate)
      if (res.affiliateName) setAffiliateName(res.affiliateName)
      if (res.affiliateIdNumber) setAffiliateIdNumber(res.affiliateIdNumber)
      setBreakdown({
        pensionAmount: res.pensionAmount ?? "",
        healthAmount: res.healthAmount ?? "",
        riskAmount: res.riskAmount ?? "",
        compensationFundAmount: res.compensationFundAmount ?? "",
      })

      const base = res.lowConfidence
        ? "Datos extraídos, pero la IA no está muy segura — revisa todo antes de guardar."
        : "Datos extraídos. Revisa antes de guardar."
      setExtractionNote({
        type: res.lowConfidence || res.warnings.length > 0 ? "warn" : "ok",
        text: [base, ...res.warnings].join(" "),
      })
    } catch {
      toast.error("No se pudo leer la planilla.")
    } finally {
      setExtracting(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    if (kind === "planilla" && !period) { setError("Elegí el periodo de cotización."); return }
    if (!expectedAmount || Number(expectedAmount) <= 0) { setError("El valor esperado debe ser mayor a 0."); return }

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.set("kind", kind)
      fd.set("period", kind === "planilla" ? period : "")
      fd.set("expectedAmount", expectedAmount)
      fd.set("planillaNumber", planillaNumber)
      fd.set("planillaTotal", planillaTotal)
      fd.set("paidDate", paidDate)
      fd.set("affiliateName", affiliateName)
      fd.set("affiliateIdNumber", affiliateIdNumber)
      fd.set("notes", notes)
      for (const [k, v] of Object.entries(breakdown)) fd.set(k, v)
      const file = fileInputRef.current?.files?.[0]
      if (file) fd.set("file", file)

      const res = await createSocialSecurityPayment({ error: null }, fd)
      if (res.error) { setError(res.error); return }
      resetForm()
      setOpen(false)
      toast.success(kind === "planilla" ? "Planilla creada." : "Inscripción creada.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Nueva planilla
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nueva planilla de seguridad social</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <Field label="Planilla (PDF o imagen)">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
            />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={extracting} onClick={handleExtract}>
                {extracting ? "Leyendo planilla…" : "Extraer datos con IA"}
              </Button>
            </div>
            {extractionNote && (
              <p className={`text-xs ${extractionNote.type === "warn" ? "text-amber-600 dark:text-amber-400" : "text-green-700 dark:text-green-400"}`}>
                {extractionNote.text}
              </p>
            )}
          </Field>

          <Field label="Tipo">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "planilla" | "inscripcion")}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="planilla">Planilla mensual</option>
              <option value="inscripcion">Inscripción</option>
            </select>
          </Field>

          {kind === "planilla" && (
            <Field label="Periodo de cotización *">
              <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </Field>
          )}

          <Field label="Valor esperado *">
            <CurrencyInput placeholder="0" value={expectedAmount} onChange={setExpectedAmount} />
            <p className="text-xs text-muted-foreground">Lo que se debe pagar por este concepto; los pagos vinculados se comparan contra este valor.</p>
          </Field>

          <Field label="N.° de planilla">
            <Input placeholder="p.ej. 88808629" value={planillaNumber} onChange={(e) => setPlanillaNumber(e.target.value)} />
          </Field>

          <Field label="Total de la planilla">
            <CurrencyInput placeholder="0" value={planillaTotal} onChange={setPlanillaTotal} />
          </Field>

          <Field label="Fecha de pago de la planilla">
            <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
          </Field>

          <Field label="Afiliado">
            <Input placeholder="Nombre" value={affiliateName} onChange={(e) => setAffiliateName(e.target.value)} />
            <Input placeholder="Cédula" value={affiliateIdNumber} onChange={(e) => setAffiliateIdNumber(e.target.value)} />
          </Field>

          <Field label="Notas">
            <Input placeholder="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium leading-none">{label}</label>
      {children}
    </div>
  )
}
