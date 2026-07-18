"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Trash2 } from "lucide-react"
import { feeInEffect } from "@/lib/owner-fees"
import { saveOwnerFee, deleteOwnerFee } from "./actions"

export type FeeStepRow = { id: string; fromMonth: string; amount: number }

function money(v: number) {
  return "$" + v.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function monthLabel(ym: string) {
  const label = new Date(ym + "-02").toLocaleDateString("es-CO", { month: "long", year: "numeric" })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

interface Props {
  unit: string
  fees: FeeStepRow[]
  currentMonth: string
  onClose: () => void
}

// Rendered with key={unit} by the table, so the form state starts fresh for each unit.
export function FeeHistoryDialog({ unit, fees, currentMonth, onClose }: Props) {
  const [pending, startTransition] = useTransition()
  const [fromMonth, setFromMonth] = useState(currentMonth)
  const [amount, setAmount] = useState("")

  const inEffect = feeInEffect(fees, currentMonth)
  const inEffectFrom = fees.filter((f) => f.fromMonth <= currentMonth).map((f) => f.fromMonth).sort().pop()
  const newestFirst = [...fees].sort((a, b) => b.fromMonth.localeCompare(a.fromMonth))
  const replacesExisting = fees.some((f) => f.fromMonth === fromMonth)

  const save = () => {
    startTransition(async () => {
      const res = await saveOwnerFee(unit, fromMonth, amount)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(replacesExisting ? "Cuota actualizada." : "Tramo agregado.")
      setAmount("")
    })
  }

  const remove = (id: string) => {
    startTransition(async () => {
      const res = await deleteOwnerFee(id)
      if (res.error) toast.error(res.error)
      else toast.success("Tramo eliminado.")
    })
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md p-6">
        <div className="flex flex-col gap-1">
          <DialogTitle>Historial de cuota — {unit}</DialogTitle>
          <DialogDescription>
            Cada tramo rige desde su mes hasta que empieza el siguiente. El primer tramo marca desde qué mes se le cobra a
            la unidad.
          </DialogDescription>
        </div>

        <div className="mt-2 overflow-hidden rounded-md border">
          {newestFirst.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">Sin cuota configurada.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {newestFirst.map((f, i) => {
                  const status = f.fromMonth > currentMonth ? "Programada" : f.fromMonth === inEffectFrom ? "Vigente" : null
                  return (
                    <tr key={f.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                      <td className="px-3 py-2 whitespace-nowrap">Desde {monthLabel(f.fromMonth)}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{money(f.amount)}</td>
                      <td className="px-2 py-2 text-right">
                        {status && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              status === "Vigente"
                                ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {status}
                          </span>
                        )}
                      </td>
                      <td className="w-8 px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => remove(f.id)}
                          disabled={pending}
                          title="Eliminar tramo"
                          className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-2 flex flex-col gap-2">
          <p className="text-sm font-medium">Agregar o corregir un tramo</p>
          <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <Input type="month" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} aria-label="Desde el mes" />
            <CurrencyInput placeholder="Cuota" value={amount} onChange={setAmount} />
            <Button onClick={save} disabled={pending || !fromMonth || !amount}>
              {pending ? "Guardando…" : replacesExisting ? "Actualizar" : "Agregar"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {replacesExisting
              ? `Ya hay un tramo desde ${monthLabel(fromMonth)}: se reemplaza su valor.`
              : inEffect != null
                ? `Cuota vigente hoy: ${money(inEffect)}.`
                : "Esta unidad todavía no tiene una cuota vigente."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
