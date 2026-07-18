"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { createFinancialAccount } from "./actions"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus } from "lucide-react"

const initialState = { error: null as string | null }

export function AddAccountForm() {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState("cash")
  const [state, formAction, isPending] = useActionState(createFinancialAccount, initialState)
  const formRef = useRef<HTMLFormElement>(null)
  const hasSubmitted = useRef(false)

  useEffect(() => {
    if (hasSubmitted.current && !isPending && !state.error) {
      setOpen(false)
      formRef.current?.reset()
      setType("cash")
      hasSubmitted.current = false
      toast.success("Cuenta creada.")
    }
  }, [state, isPending])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Nueva cuenta
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nueva cuenta</SheetTitle>
        </SheetHeader>

        <form
          ref={formRef}
          action={formAction}
          onSubmit={() => { hasSubmitted.current = true }}
          className="mt-6 flex flex-col gap-4"
        >
          <Field label="Nombre *">
            <Input name="name" required placeholder="Bancolombia Ahorros, Efectivo, ..." />
          </Field>

          <Field label="Tipo">
            <select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="cash">Caja / Efectivo</option>
              <option value="bank">Cuenta bancaria</option>
            </select>
          </Field>

          {type === "bank" && (
            <Field label="N° de cuenta">
              <Input name="bankAccountNumber" placeholder="N° de cuenta" />
            </Field>
          )}

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

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
