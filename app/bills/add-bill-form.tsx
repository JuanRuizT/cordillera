"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { createBill, extractBillFromFile } from "./actions"
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

export function AddBillForm() {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [concept, setConcept] = useState("")
  const [amount, setAmount] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractionNote, setExtractionNote] = useState<{ type: "ok" | "warn"; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function resetForm() {
    setDate("")
    setDueDate("")
    setConcept("")
    setAmount("")
    setNotes("")
    setError(null)
    setExtractionNote(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function handleExtract() {
    const file = fileInputRef.current?.files?.[0]
    if (!file) { toast.error("Selecciona la factura primero."); return }
    setExtracting(true)
    setExtractionNote(null)
    try {
      const fd = new FormData()
      fd.set("file", file)
      const res = await extractBillFromFile(fd)
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo leer la factura.")
        return
      }

      if (!res.isBill) {
        setExtractionNote({
          type: "warn",
          text: `Este archivo no parece una factura${res.documentKind ? ` (parece: ${res.documentKind})` : ""}. Revisa que sea el documento correcto — no se llenó ningún campo.`,
        })
        return
      }

      if (res.concept) setConcept(res.concept)
      if (res.amount) setAmount(res.amount)
      if (res.date) setDate(res.date)
      if (res.dueDate) setDueDate(res.dueDate)
      // Notes are free text the user may have already typed: suggest, never overwrite.
      const suggestedNotes = res.notes
      if (suggestedNotes) setNotes((prev) => (prev.trim() ? prev : suggestedNotes))

      setExtractionNote(
        res.lowConfidence
          ? { type: "warn", text: "Datos extraídos, pero la IA no está muy segura — revisa todo antes de guardar." }
          : { type: "ok", text: "Datos extraídos. Revisa antes de guardar." }
      )
    } catch {
      toast.error("No se pudo leer la factura.")
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
      if (!concept.trim()) { setError("El concepto es requerido."); return }
      if (!date) { setError("La fecha es requerida."); return }
      if (!amount || Number(amount) <= 0) { setError("El monto debe ser mayor a 0."); return }

      const fd = new FormData()
      fd.set("concept", concept.trim())
      fd.set("date", date)
      fd.set("dueDate", dueDate)
      fd.set("amount", amount)
      fd.set("notes", notes)
      const file = fileInputRef.current?.files?.[0]
      if (file) fd.set("file", file)

      const res = await createBill({ error: null }, fd)
      if (res.error) { setError(res.error); return }

      resetForm()
      setOpen(false)
      toast.success("Factura creada.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Nueva factura
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nueva factura</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <Field label="Factura (PDF o imagen)">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
            />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={extracting} onClick={handleExtract}>
                {extracting ? "Leyendo factura…" : "Extraer datos con IA"}
              </Button>
            </div>
            {extractionNote && (
              <p className={`text-xs ${extractionNote.type === "warn" ? "text-amber-600 dark:text-amber-400" : "text-green-700 dark:text-green-400"}`}>
                {extractionNote.text}
              </p>
            )}
          </Field>

          <Field label="Concepto (proveedor) *">
            <Input required placeholder="p.ej. CHEC - Energía" value={concept} onChange={(e) => setConcept(e.target.value)} />
          </Field>

          <Field label="Fecha *">
            <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>

          <Field label="Fecha máxima de pago">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>

          <Field label="Monto *">
            <CurrencyInput placeholder="0" value={amount} onChange={setAmount} />
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
