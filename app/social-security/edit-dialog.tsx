"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CurrencyInput } from "@/components/ui/currency-input"
import { updateSocialSecurityPayment } from "./actions"
import type { SocialSecurityData } from "@/lib/social-security/document-data"

interface Props {
  entry: SocialSecurityData
  onClose: () => void
}

// Rendered with key={entry.id} by the table, so the fields start from the entry being edited.
export function EditSocialSecurityDialog({ entry, onClose }: Props) {
  const [pending, startTransition] = useTransition()
  const [kind, setKind] = useState(entry.kind)
  const [period, setPeriod] = useState(entry.period ?? "")
  const [expectedAmount, setExpectedAmount] = useState(entry.expectedAmount)
  const [planillaNumber, setPlanillaNumber] = useState(entry.planillaNumber ?? "")
  const [planillaTotal, setPlanillaTotal] = useState(entry.planillaTotal ?? "")
  const [paidDate, setPaidDate] = useState(entry.paidDate?.slice(0, 10) ?? "")
  const [notes, setNotes] = useState(entry.notes ?? "")

  const save = () => {
    const expected = parseFloat(expectedAmount)
    if (isNaN(expected) || expected <= 0) { toast.error("El valor esperado debe ser mayor a 0."); return }
    if (kind === "planilla" && !period) { toast.error("Elegí el periodo de cotización."); return }
    startTransition(async () => {
      const res = await updateSocialSecurityPayment(entry.id, {
        kind,
        period: kind === "planilla" ? period : null,
        expectedAmount: expected,
        planillaNumber: planillaNumber || null,
        planillaTotal: planillaTotal ? parseFloat(planillaTotal) : null,
        paidDate: paidDate || null,
        notes: notes || null,
      })
      if (res.error) toast.error(res.error)
      else { toast.success("Guardado."); onClose() }
    })
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg p-6">
        <div className="flex flex-col gap-1">
          <DialogTitle>Editar — {entry.label}</DialogTitle>
          <DialogDescription>Los pagos se vinculan desde Contabilidad, en la columna Seguridad Social.</DialogDescription>
        </div>

        <div className="mt-2 flex flex-col gap-4">
          <Field label="Tipo">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as SocialSecurityData["kind"])}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="planilla">Planilla mensual</option>
              <option value="inscripcion">Inscripción</option>
            </select>
          </Field>
          {kind === "planilla" && (
            <Field label="Periodo de cotización">
              <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </Field>
          )}
          <Field label="Valor esperado">
            <CurrencyInput value={expectedAmount} onChange={setExpectedAmount} />
          </Field>
          <Field label="N.° de planilla">
            <Input value={planillaNumber} onChange={(e) => setPlanillaNumber(e.target.value)} />
          </Field>
          <Field label="Total de la planilla">
            <CurrencyInput value={planillaTotal} onChange={setPlanillaTotal} />
          </Field>
          <Field label="Fecha de pago de la planilla">
            <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
          </Field>
          <Field label="Notas">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas (opcional)" />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button onClick={save} disabled={pending}>{pending ? "Guardando..." : "Guardar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
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
