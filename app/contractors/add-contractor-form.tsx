"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { createContractor } from "./actions"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PhoneInput } from "@/components/ui/phone-input"
import { IdNumberInput } from "@/components/ui/id-number-input"
import { Plus } from "lucide-react"

const initialState = { error: null as string | null }

export function AddContractorForm() {
  const [open, setOpen] = useState(false)
  const [idType, setIdType] = useState("CC")
  const [idNumber, setIdNumber] = useState("")
  const [bankAccountType, setBankAccountType] = useState("")
  const [phone, setPhone] = useState("")
  const [state, formAction, isPending] = useActionState(createContractor, initialState)
  const formRef = useRef<HTMLFormElement>(null)
  const hasSubmitted = useRef(false)

  useEffect(() => {
    if (hasSubmitted.current && !isPending && !state.error) {
      setOpen(false)
      formRef.current?.reset()
      setIdType("CC")
      setIdNumber("")
      setBankAccountType("")
      setPhone("")
      hasSubmitted.current = false
      toast.success("Contratista creado.")
    }
  }, [state, isPending])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Nuevo contratista
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nuevo contratista</SheetTitle>
        </SheetHeader>

        <form
          ref={formRef}
          action={formAction}
          onSubmit={() => { hasSubmitted.current = true }}
          className="mt-6 flex flex-col gap-4"
        >
          <Field label="Nombre *">
            <Input name="name" required placeholder="Nombre o razón social" />
          </Field>

          <div className="grid grid-cols-[90px_1fr] gap-3">
            <Field label="Tipo">
              <select
                name="idType"
                value={idType}
                onChange={(e) => setIdType(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="CC">C.C</option>
                <option value="NIT">NIT</option>
              </select>
            </Field>
            <Field label="Número *">
              <input type="hidden" name="idNumber" value={idNumber} />
              <IdNumberInput value={idNumber} onChange={setIdNumber} required placeholder="C.C / NIT" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Banco">
              <Input name="bankName" placeholder="Banco" />
            </Field>
            <Field label="Cuenta">
              <Input name="bankAccount" placeholder="N° de cuenta" />
            </Field>
          </div>

          <Field label="Tipo de Cuenta">
            <select
              name="bankAccountType"
              value={bankAccountType}
              onChange={(e) => setBankAccountType(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— Sin especificar —</option>
              <option value="Ahorros">Ahorros</option>
              <option value="Corriente">Corriente</option>
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono">
              <input type="hidden" name="phone" value={phone} />
              <PhoneInput value={phone} onChange={setPhone} />
            </Field>
            <Field label="Correo">
              <Input name="email" type="email" placeholder="correo@ejemplo.com" />
            </Field>
          </div>

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
