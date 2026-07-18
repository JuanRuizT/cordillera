"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PhoneInput } from "@/components/ui/phone-input"
import { IdNumberInput } from "@/components/ui/id-number-input"
import { updateContractor, type ContractorData } from "./actions"

interface Props {
  contractor: ContractorData | null
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

export function EditContractorDialog({ contractor, open, onClose }: Props) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [idType, setIdType] = useState("CC")
  const [idNumber, setIdNumber] = useState("")
  const [bankName, setBankName] = useState("")
  const [bankAccount, setBankAccount] = useState("")
  const [bankAccountType, setBankAccountType] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")

  useEffect(() => {
    if (!contractor) return
    setName(contractor.name)
    setIdType(contractor.idType)
    setIdNumber(contractor.idNumber)
    setBankName(contractor.bankName ?? "")
    setBankAccount(contractor.bankAccount ?? "")
    setBankAccountType(contractor.bankAccountType ?? "")
    setPhone(contractor.phone ?? "")
    setEmail(contractor.email ?? "")
  }, [contractor])

  if (!contractor) return null

  const handleSave = () => {
    if (!name.trim()) { toast.error("El nombre es requerido."); return }
    if (!idNumber.trim()) { toast.error("La C.C / NIT es requerida."); return }

    startTransition(async () => {
      const updates: Array<[string, string]> = []

      if (name.trim() !== contractor.name) updates.push(["name", name.trim()])
      if (idType !== contractor.idType) updates.push(["idType", idType])
      if (idNumber.trim() !== contractor.idNumber) updates.push(["idNumber", idNumber.trim()])
      if (bankName.trim() !== (contractor.bankName ?? "")) updates.push(["bankName", bankName.trim()])
      if (bankAccount.trim() !== (contractor.bankAccount ?? "")) updates.push(["bankAccount", bankAccount.trim()])
      if (bankAccountType !== (contractor.bankAccountType ?? "")) updates.push(["bankAccountType", bankAccountType])
      if (phone !== (contractor.phone ?? "")) updates.push(["phone", phone])
      if (email.trim() !== (contractor.email ?? "")) updates.push(["email", email.trim()])

      if (updates.length === 0) { onClose(); return }

      await Promise.all(updates.map(([field, value]) => updateContractor(contractor.id, field, value)))
      toast.success("Contratista actualizado.")
      onClose()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg p-6">
        <DialogTitle>Editar contratista</DialogTitle>

        <div className="mt-4 flex flex-col gap-4">
          <Field label="Nombre">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <div className="grid grid-cols-[90px_1fr] gap-3">
            <Field label="Tipo">
              <select
                value={idType}
                onChange={(e) => setIdType(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="CC">C.C</option>
                <option value="NIT">NIT</option>
              </select>
            </Field>
            <Field label="Número">
              <IdNumberInput value={idNumber} onChange={setIdNumber} placeholder="C.C / NIT" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Banco">
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Banco" />
            </Field>
            <Field label="Cuenta">
              <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="N° de cuenta" />
            </Field>
          </div>

          <Field label="Tipo de Cuenta">
            <select
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
              <PhoneInput value={phone} onChange={setPhone} />
            </Field>
            <Field label="Correo">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
            </Field>
          </div>
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
