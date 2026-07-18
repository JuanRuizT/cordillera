"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { setSupportNotRequired } from "./actions"

interface Props {
  ids: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Asks for an optional reason before marking one or more egresos as "No requiere soporte".
//
// Always mounted and controlled through `open` (same as PaymentProofsDialog) — never mounted and
// unmounted on demand — and confirming closes the dialog before saving, so the close never
// overlaps the table's post-save refresh.
//
// The table freezing after this dialog (body left with `pointer-events: none`) was really caused
// by two copies of @radix-ui/react-dismissable-layer: the row menus and this Dialog each tracked
// open layers separately, so the Dialog, opened from a menu still closing, "restored" the body
// to the menu's `none`. package.json `overrides` pins a single copy — keep it when upgrading Radix.
export function SupportNotRequiredDialog({ ids, open, onOpenChange }: Props) {
  const [reason, setReason] = useState("")
  const [, startTransition] = useTransition()
  const count = ids.length

  const handleOpenChange = (next: boolean) => {
    if (!next) setReason("")
    onOpenChange(next)
  }

  const confirm = () => {
    const targetIds = ids
    const motivo = reason
    handleOpenChange(false)
    startTransition(async () => {
      const res = await setSupportNotRequired(targetIds, true, motivo)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(
        res.updated === 1 ? "Registro marcado: no requiere soporte." : `${res.updated} registros marcados: no requieren soporte.`
      )
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md p-6">
        <div className="flex flex-col gap-1">
          <DialogTitle>No requiere soporte</DialogTitle>
          <DialogDescription>
            {count === 1 ? "Este egreso no necesita" : `Estos ${count} egresos no necesitan`} comprobante de egreso ni
            cuenta de cobro, y dejan de marcarse en ámbar. Si más adelante generás un comprobante o vinculás una cuenta
            de cobro, el documento se sigue mostrando.
          </DialogDescription>
        </div>

        <div className="flex flex-col gap-1.5 py-3">
          <label htmlFor="support-reason" className="text-sm font-medium">Motivo (opcional)</label>
          <Input
            id="support-reason"
            autoFocus
            maxLength={200}
            placeholder="p.ej. Cuota de manejo de la tarjeta"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirm() }}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
          <Button onClick={confirm} disabled={count === 0}>Confirmar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
