"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { updateFinancialAccount, deleteFinancialAccount, type FinancialAccountWithBalance } from "./actions"
import { EditAccountDialog } from "./edit-account-dialog"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { Trash2 } from "lucide-react"

type EditingCell = { id: string; field: string; value: string } | null

const TYPE_LABELS: Record<string, string> = {
  bank: "Cuenta bancaria",
  cash: "Caja / Efectivo",
}

function money(v: string | number) {
  return "$" + Number(v).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function AccountsTable({
  accounts,
  unassignedBalance,
  totalBalance,
}: {
  accounts: FinancialAccountWithBalance[]
  unassignedBalance: string
  totalBalance: string
}) {
  const [editing, setEditing] = useState<EditingCell>(null)
  const [, startTransition] = useTransition()
  const [toDelete, setToDelete] = useState<FinancialAccountWithBalance | null>(null)

  const commit = () => {
    if (!editing) return
    const snapshot = { ...editing }
    setEditing(null)
    startTransition(async () => {
      await updateFinancialAccount(snapshot.id, snapshot.field, snapshot.value)
    })
  }

  const confirmDelete = () => {
    if (!toDelete) return
    const a = toDelete
    setToDelete(null)
    startTransition(async () => {
      const res = await deleteFinancialAccount(a.id)
      if (res.error) toast.error(res.error)
      else toast.success("Cuenta eliminada.")
    })
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        No hay cuentas. Crea la primera con &quot;Nueva cuenta&quot;.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-muted/50 text-left">
            <th className="px-4 py-3 font-semibold whitespace-nowrap">Nombre</th>
            <th className="px-4 py-3 font-semibold whitespace-nowrap">Tipo</th>
            <th className="px-4 py-3 font-semibold whitespace-nowrap">N° de cuenta</th>
            <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Saldo</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {accounts.map((a, i) => {
            const isEditingName = editing?.id === a.id && editing.field === "name"
            const isEditingType = editing?.id === a.id && editing.field === "type"
            const isEditingNumber = editing?.id === a.id && editing.field === "bankAccountNumber"
            return (
              <tr key={a.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                <td
                  className="px-4 py-2 whitespace-nowrap"
                  onClick={() => { if (!isEditingName) setEditing({ id: a.id, field: "name", value: a.name }) }}
                >
                  {isEditingName ? (
                    <input
                      autoFocus
                      value={editing.value}
                      onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                      onBlur={commit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commit()
                        if (e.key === "Escape") setEditing(null)
                      }}
                      className="h-8 w-full min-w-[120px] rounded border border-input bg-background px-2 text-sm"
                    />
                  ) : (
                    <span className="block min-h-[1.25rem] cursor-text">{a.name}</span>
                  )}
                </td>
                <td
                  className="px-4 py-2 whitespace-nowrap"
                  onClick={() => { if (!isEditingType) setEditing({ id: a.id, field: "type", value: a.type }) }}
                >
                  {isEditingType ? (
                    <select
                      autoFocus
                      value={editing.value}
                      onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                      onBlur={commit}
                      className="h-8 rounded border border-input bg-background px-1 text-sm"
                    >
                      <option value="cash">Caja / Efectivo</option>
                      <option value="bank">Cuenta bancaria</option>
                    </select>
                  ) : (
                    <span className="block min-h-[1.25rem] cursor-text">{TYPE_LABELS[a.type] ?? a.type}</span>
                  )}
                </td>
                <td
                  className="px-4 py-2 whitespace-nowrap"
                  onClick={() => {
                    if (a.type !== "cash" && !isEditingNumber) {
                      setEditing({ id: a.id, field: "bankAccountNumber", value: a.bankAccountNumber ?? "" })
                    }
                  }}
                >
                  {a.type === "cash" ? (
                    // Cash has no real account number — it just takes the account's own name.
                    <span className="block min-h-[1.25rem]">{a.name}</span>
                  ) : isEditingNumber ? (
                    <input
                      autoFocus
                      value={editing.value}
                      onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                      onBlur={commit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commit()
                        if (e.key === "Escape") setEditing(null)
                      }}
                      className="h-8 w-full min-w-[120px] rounded border border-input bg-background px-2 text-sm"
                    />
                  ) : (
                    <span className="block min-h-[1.25rem] cursor-text">
                      {a.bankAccountNumber || <span className="text-muted-foreground">—</span>}
                    </span>
                  )}
                </td>
                <td className={`px-4 py-2 text-right tabular-nums font-medium ${Number(a.balance) >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {money(a.balance)}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <EditAccountDialog account={a} />
                    <button
                      onClick={() => setToDelete(a)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
          {Number(unassignedBalance) !== 0 && (
            <tr className="border-t bg-muted/20">
              <td className="px-4 py-2 whitespace-nowrap italic text-muted-foreground">Sin cuenta asignada</td>
              <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">—</td>
              <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">—</td>
              <td className={`px-4 py-2 text-right tabular-nums font-medium ${Number(unassignedBalance) >= 0 ? "text-green-600" : "text-red-600"}`}>
                {money(unassignedBalance)}
              </td>
              <td className="px-4 py-2" />
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted font-semibold">
            <td className="px-4 py-3" colSpan={3}>Total</td>
            <td className={`px-4 py-3 text-right tabular-nums ${Number(totalBalance) >= 0 ? "text-green-600" : "text-red-600"}`}>
              {money(totalBalance)}
            </td>
            <td className="px-4 py-3" />
          </tr>
        </tfoot>
      </table>

      <AlertDialog open={toDelete !== null} onOpenChange={(v) => { if (!v) setToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cuenta</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar &quot;{toDelete?.name}&quot;? Los registros contables que la usan quedarán sin cuenta asignada. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 focus-visible:ring-red-600"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
