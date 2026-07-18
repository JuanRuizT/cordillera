"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { updateFinancialAccountFull, type FinancialAccountData } from "./actions"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Pencil } from "lucide-react"
import { Field } from "./add-account-form"

const initialState = { error: null as string | null }

export function EditAccountDialog({ account }: { account: FinancialAccountData }) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState(account.type)
  const [state, formAction, isPending] = useActionState(updateFinancialAccountFull, initialState)
  const hasSubmitted = useRef(false)

  useEffect(() => {
    if (hasSubmitted.current && !isPending && !state.error) {
      setOpen(false)
      hasSubmitted.current = false
      toast.success("Cuenta actualizada.")
    }
  }, [state, isPending])

  return (
    <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (v) setType(account.type) }}>
      <SheetTrigger asChild>
        <button className="text-muted-foreground hover:text-primary" title="Editar">
          <Pencil className="h-4 w-4" />
        </button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Editar cuenta</SheetTitle>
        </SheetHeader>

        <form
          action={formAction}
          onSubmit={() => { hasSubmitted.current = true }}
          className="mt-6 flex flex-col gap-4"
        >
          <input type="hidden" name="id" value={account.id} />

          <Field label="Nombre *">
            <Input name="name" required defaultValue={account.name} />
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
              <Input name="bankAccountNumber" placeholder="N° de cuenta" defaultValue={account.bankAccountNumber ?? ""} />
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
