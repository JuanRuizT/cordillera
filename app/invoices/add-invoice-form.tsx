"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { createInvoice, extractInvoiceFromPdf, getNextInvoiceNumber } from "./actions"
import { createContractorInline, type ContractorData } from "../contractors/actions"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Plus } from "lucide-react"

// Por ley, la retención en la fuente solo puede ser 4% o 6%.
// Kept in sync with VALID_RETENTION_RATES in actions.ts.
const RETENTION_RATE_OPTIONS = [4, 6]

export function AddInvoiceForm({ contractors }: { contractors: ContractorData[] }) {
  const [open, setOpen] = useState(false)
  const [number, setNumber] = useState("")
  const [contractorId, setContractorId] = useState(contractors[0]?.id ?? "")
  const [creatingContractor, setCreatingContractor] = useState(contractors.length === 0)
  const [newContractorName, setNewContractorName] = useState("")
  const [newContractorIdType, setNewContractorIdType] = useState("CC")
  const [newContractorIdNumber, setNewContractorIdNumber] = useState("")
  const [date, setDate] = useState("")
  const [concept, setConcept] = useState("")
  const [totalAmount, setTotalAmount] = useState("")
  const [retentionRate, setRetentionRate] = useState("")
  const [bankInfo, setBankInfo] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractionNote, setExtractionNote] = useState<{ type: "ok" | "warn"; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    getNextInvoiceNumber().then((n) => setNumber(String(n)))
  }, [open])

  function resetForm() {
    setNumber("")
    setContractorId(contractors[0]?.id ?? "")
    setCreatingContractor(contractors.length === 0)
    setNewContractorName("")
    setNewContractorIdType("CC")
    setNewContractorIdNumber("")
    setDate("")
    setConcept("")
    setTotalAmount("")
    setRetentionRate("")
    setBankInfo("")
    setNotes("")
    setError(null)
    setExtractionNote(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function handleExtract() {
    const file = fileInputRef.current?.files?.[0]
    if (!file) { toast.error("Selecciona un PDF primero."); return }
    setExtracting(true)
    setExtractionNote(null)
    try {
      const fd = new FormData()
      fd.set("file", file)
      const res = await extractInvoiceFromPdf(fd)
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo leer el PDF.")
        return
      }

      if (res.concept) setConcept(res.concept)
      if (res.totalAmount) setTotalAmount(res.totalAmount)
      if (res.date) setDate(res.date)
      if (res.retentionRate) setRetentionRate(String(res.retentionRate))
      if (res.bankInfo) setBankInfo(res.bankInfo)

      if (res.matchedContractorId) {
        setContractorId(res.matchedContractorId)
        setCreatingContractor(false)
      } else if (res.contractorName || res.contractorIdNumber) {
        setCreatingContractor(true)
        setNewContractorName(res.contractorName ?? "")
        setNewContractorIdNumber(res.contractorIdNumber ?? "")
      }

      setExtractionNote(
        res.lowConfidence
          ? { type: "warn", text: "Datos extraídos, pero la IA no está muy segura — revisa todo antes de guardar." }
          : { type: "ok", text: "Datos extraídos. Revisa antes de guardar." }
      )
    } catch {
      toast.error("No se pudo leer el PDF.")
    } finally {
      setExtracting(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      let finalContractorId = contractorId
      if (creatingContractor) {
        if (!newContractorName.trim() || !newContractorIdNumber.trim()) {
          setError("Completa el nombre y la cédula/NIT del nuevo contratista.")
          return
        }
        const res = await createContractorInline({
          name: newContractorName.trim(),
          idType: newContractorIdType,
          idNumber: newContractorIdNumber.trim(),
        })
        if (res.error || !res.contractor) {
          setError(res.error ?? "No se pudo crear el contratista.")
          return
        }
        finalContractorId = res.contractor.id
      }
      if (!finalContractorId) { setError("Selecciona o crea un contratista."); return }
      if (!concept.trim()) { setError("El concepto es requerido."); return }
      if (!date) { setError("La fecha es requerida."); return }
      if (!totalAmount || Number(totalAmount) <= 0) { setError("El total debe ser mayor a 0."); return }
      const trimmedNumber = number.trim()
      if (trimmedNumber && (!/^\d+$/.test(trimmedNumber) || parseInt(trimmedNumber, 10) < 1)) {
        setError("El número debe ser un entero positivo.")
        return
      }

      const fd = new FormData()
      fd.set("number", trimmedNumber)
      fd.set("contractorId", finalContractorId)
      fd.set("concept", concept.trim())
      fd.set("date", date)
      fd.set("totalAmount", totalAmount)
      fd.set("retentionRate", retentionRate)
      fd.set("bankInfo", bankInfo)
      fd.set("notes", notes)
      const file = fileInputRef.current?.files?.[0]
      if (file) fd.set("file", file)

      const res = await createInvoice({ error: null }, fd)
      if (res.error) { setError(res.error); return }

      resetForm()
      setOpen(false)
      toast.success("Cuenta de cobro creada.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Nueva cuenta de cobro
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nueva cuenta de cobro</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <Field label="PDF de la cuenta de cobro">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
            />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={extracting} onClick={handleExtract}>
                {extracting ? "Leyendo PDF…" : "Extraer datos con IA"}
              </Button>
            </div>
            {extractionNote && (
              <p className={`text-xs ${extractionNote.type === "warn" ? "text-amber-600 dark:text-amber-400" : "text-green-700 dark:text-green-400"}`}>
                {extractionNote.text}
              </p>
            )}
          </Field>

          <Field label="Número">
            <Input
              type="number"
              min="1"
              placeholder="—"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </Field>

          {!creatingContractor ? (
            <Field label="Contratista *">
              <select
                value={contractorId}
                onChange={(e) => setContractorId(e.target.value)}
                required
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.idNumber}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setCreatingContractor(true)}
                className="self-start text-xs text-primary hover:underline"
              >
                + Crear nuevo contratista
              </button>
            </Field>
          ) : (
            <Field label="Contratista nuevo *">
              <div className="flex flex-col gap-2 rounded-md border p-3">
                {contractors.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCreatingContractor(false)}
                    className="self-end text-xs text-muted-foreground hover:underline"
                  >
                    Usar existente
                  </button>
                )}
                <Input placeholder="Nombre o razón social" value={newContractorName} onChange={(e) => setNewContractorName(e.target.value)} />
                <div className="grid grid-cols-[90px_1fr] gap-2">
                  <select
                    value={newContractorIdType}
                    onChange={(e) => setNewContractorIdType(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="CC">C.C</option>
                    <option value="NIT">NIT</option>
                  </select>
                  <Input placeholder="C.C / NIT" value={newContractorIdNumber} onChange={(e) => setNewContractorIdNumber(e.target.value)} />
                </div>
              </div>
            </Field>
          )}

          <Field label="Fecha *">
            <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>

          <Field label="Concepto (trabajo) *">
            <Input required placeholder="Descripción del trabajo" value={concept} onChange={(e) => setConcept(e.target.value)} />
          </Field>

          <Field label="Total *">
            <CurrencyInput placeholder="0" value={totalAmount} onChange={setTotalAmount} />
          </Field>

          <Field label="Retención en la fuente (opcional)">
            <select
              value={retentionRate}
              onChange={(e) => setRetentionRate(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— Sin retención —</option>
              {RETENTION_RATE_OPTIONS.map((rate) => (
                <option key={rate} value={rate}>{rate}%</option>
              ))}
            </select>
          </Field>

          <Field label="Datos bancarios">
            <Input placeholder="Cuenta de Ahorros Bancolombia # ..." value={bankInfo} onChange={(e) => setBankInfo(e.target.value)} />
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
