"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { linkSocialSecurityPayment, unlinkSocialSecurityPayment } from "../social-security/actions"
import type { SocialSecurityLinkOption } from "../social-security/actions"

type LinkRecord = {
  id: string
  concept: string
  expenses: string | null
  income: string | null
  socialSecurityId: string | null
  socialSecurityLabel: string | null
}

function money(v: string | number) {
  const n = Number(v)
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

interface Props {
  record: LinkRecord | null
  options: SocialSecurityLinkOption[]
  open: boolean
  onClose: () => void
}

// Always mounted and driven by `open`, like SupportNotRequiredDialog — never mounted on demand, so
// Radix always runs its normal close sequence and the page can't be left with pointer events off.
export function LinkSocialSecurityDialog({ record, options, open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md p-6">
        {/* Keyed by record so the selection starts from that record's current link every time. */}
        {record && <LinkForm key={record.id} record={record} options={options} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function LinkForm({ record, options, onClose }: { record: LinkRecord; options: SocialSecurityLinkOption[]; onClose: () => void }) {
  const [selected, setSelected] = useState(record.socialSecurityId ?? "")
  const [pending, startTransition] = useTransition()
  const amount = Number(record.expenses ?? record.income ?? 0)

  const save = () => {
    startTransition(async () => {
      const res = selected ? await linkSocialSecurityPayment(record.id, selected) : await unlinkSocialSecurityPayment(record.id)
      if (res.error) { toast.error(res.error); return }
      toast.success(selected ? "Pago vinculado a la planilla." : "Pago desvinculado de la planilla.")
      onClose()
    })
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <DialogTitle>Seguridad social del registro</DialogTitle>
        <DialogDescription className="truncate">{record.concept} — {money(amount)}</DialogDescription>
      </div>

      <div className="flex flex-col gap-1.5 py-3">
        <label className="text-sm font-medium">Corresponde a la planilla</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">— Ninguna —</option>
          {record.socialSecurityId && !options.some((o) => o.id === record.socialSecurityId) && (
            <option value={record.socialSecurityId}>{record.socialSecurityLabel ?? "Planilla actual"}</option>
          )}
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label} (pend. {money(o.pendingAmount)} de {money(o.expectedAmount)})
            </option>
          ))}
        </select>
        {options.length === 0 && (
          <p className="text-xs text-muted-foreground">No hay planillas todavía. Créalas en la pestaña Seguridad Social.</p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={save} disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
      </div>
    </>
  )
}
