"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CurrencyInput } from "@/components/ui/currency-input"
import { CategoryCombobox } from "@/components/ui/category-combobox"
import { updateAccountingRecord } from "./actions"
import type { AccountingRow } from "./table"
import type { FinancialAccountData } from "../accounts/actions"

interface Props {
  record: AccountingRow | null
  units: string[]
  accounts: FinancialAccountData[]
  open: boolean
  onClose: () => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium leading-none">{label}</label>
      {children}
    </div>
  )
}

export function EditRecordDialog({ record, units, accounts, open, onClose }: Props) {
  const [isPending, startTransition] = useTransition()
  const [concept, setConcept] = useState("")
  const [date, setDate] = useState("")
  const [income, setIncome] = useState("")
  const [expenses, setExpenses] = useState("")
  const [category, setCategory] = useState("")
  const [property, setProperty] = useState("")
  const [accountId, setAccountId] = useState("")

  useEffect(() => {
    if (!record) return
    setConcept(record.concept)
    setDate(record.date.slice(0, 10))
    setIncome(record.income ?? "")
    setExpenses(record.expenses ?? "")
    setCategory(record.category ?? "")
    setProperty(record.property ?? "")
    setAccountId(record.accountId ?? "")
  }, [record])

  if (!record) return null

  const handleSave = () => {
    if (!concept.trim()) { toast.error("El concepto no puede estar vacío."); return }
    if (!date) { toast.error("La fecha es requerida."); return }

    startTransition(async () => {
      const updates: Array<[string, string]> = []

      if (concept.trim() !== record.concept) updates.push(["concept", concept.trim()])
      if (date !== record.date.slice(0, 10)) updates.push(["date", date])
      if (income !== (record.income ?? "")) updates.push(["income", income])
      if (expenses !== (record.expenses ?? "")) updates.push(["expenses", expenses])
      if (category !== (record.category ?? "")) updates.push(["category", category])
      if (property !== (record.property ?? "")) updates.push(["property", property])
      if (accountId !== (record.accountId ?? "")) updates.push(["accountId", accountId])

      if (updates.length === 0) { onClose(); return }

      await Promise.all(updates.map(([field, value]) => updateAccountingRecord(record.id, field, value)))
      toast.success("Registro actualizado.")
      onClose()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg p-6">
        <DialogTitle>Editar registro</DialogTitle>

        <div className="mt-4 flex flex-col gap-4">
          <Field label="Concepto">
            <Input value={concept} onChange={(e) => setConcept(e.target.value)} />
          </Field>

          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Ingreso">
              <CurrencyInput placeholder="—" value={income} onChange={setIncome} />
            </Field>
            <Field label="Egreso">
              <CurrencyInput placeholder="—" value={expenses} onChange={setExpenses} />
            </Field>
          </div>

          <Field label="Categoría">
            <CategoryCombobox value={category} onChange={setCategory} variant="form" />
          </Field>

          <Field label="Propiedad">
            <CategoryCombobox value={property} onChange={setProperty} variant="form" options={units.length > 0 ? units : undefined} />
          </Field>

          <Field label="Cuenta">
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— Sin cuenta —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
