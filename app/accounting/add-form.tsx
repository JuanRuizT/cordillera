"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { createAccountingRecord } from "./actions"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { CategoryCombobox } from "@/components/ui/category-combobox"
import { Input } from "@/components/ui/input"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Plus } from "lucide-react"
import type { FinancialAccountData } from "../accounts/actions"

const initialState = { error: null as string | null }

export function AddAccountingRecordForm({ units, accounts }: { units: string[]; accounts: FinancialAccountData[] }) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState("")
  const [property, setProperty] = useState("")
  const [accountId, setAccountId] = useState("")
  const [income, setIncome] = useState("")
  const [expenses, setExpenses] = useState("")
  const [state, formAction, isPending] = useActionState(createAccountingRecord, initialState)
  const formRef = useRef<HTMLFormElement>(null)
  const hasSubmitted = useRef(false)

  useEffect(() => {
    if (hasSubmitted.current && !isPending && !state.error) {
      setOpen(false)
      formRef.current?.reset()
      setCategory("")
      setProperty("")
      setAccountId("")
      setIncome("")
      setExpenses("")
      hasSubmitted.current = false
      toast.success("Registro creado.")
    }
  }, [state, isPending])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Nuevo registro
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nuevo registro contable</SheetTitle>
        </SheetHeader>

        <form
          ref={formRef}
          action={formAction}
          onSubmit={() => { hasSubmitted.current = true }}
          className="mt-6 flex flex-col gap-4"
        >
          <Field label="Concepto *">
            <Input name="concept" required placeholder="Descripción del movimiento" />
          </Field>

          <Field label="Fecha *">
            <Input name="date" type="date" required />
          </Field>

          <Field label="Ingreso">
            <input type="hidden" name="income" value={income} />
            <CurrencyInput value={income} onChange={setIncome} placeholder="0" />
          </Field>

          <Field label="Egreso">
            <input type="hidden" name="expenses" value={expenses} />
            <CurrencyInput value={expenses} onChange={setExpenses} placeholder="0" />
          </Field>

          <Field label="Categoría">
            <input type="hidden" name="category" value={category} />
            <CategoryCombobox value={category} onChange={setCategory} variant="form" />
          </Field>

          <Field label="Propiedad">
            <input type="hidden" name="property" value={property} />
            <CategoryCombobox value={property} onChange={setProperty} variant="form" options={units} />
          </Field>

          <Field label="Cuenta">
            <select
              name="accountId"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— Sin cuenta —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {accounts.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                No hay cuentas creadas todavía. Creá una en &quot;Cuentas Bancarias&quot;.
              </p>
            )}
          </Field>

          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <Button type="submit" disabled={isPending} className="mt-2">
            {isPending ? "Guardando..." : "Guardar"}
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
