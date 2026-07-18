"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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
import { BookDown, RefreshCw, Trash2 } from "lucide-react"
import { deleteStatement, processStatement, moveToAccounting } from "./actions"

export function DeleteStatementButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  const run = () =>
    startTransition(async () => {
      try {
        const res = await deleteStatement(id)
        if (res.error) toast.error(res.error)
        else toast.success("Extracto eliminado.")
      } catch {
        toast.error("No se pudo eliminar el extracto.")
      }
    })

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={pending}
        onClick={() => setOpen(true)}
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        title="Eliminar extracto"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar extracto</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará el extracto y su archivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={run}
              className="bg-red-600 hover:bg-red-700 focus-visible:ring-red-600"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function ProcessStatementButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition()

  const run = () =>
    startTransition(async () => {
      try {
        const res = await processStatement(id)
        if (res.error) toast.error(res.error)
        else toast.success("Extracto procesado.")
      } catch {
        toast.error("No se pudo procesar el extracto.")
      }
    })

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={pending}
      onClick={run}
      className="h-8 w-8 text-muted-foreground hover:text-blue-600 disabled:opacity-50"
      title="Procesar extracto"
    >
      <RefreshCw className={`h-4 w-4${pending ? " animate-spin" : ""}`} />
    </Button>
  )
}

export function MoveToAccountingButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition()

  const run = () =>
    startTransition(async () => {
      try {
        const res = await moveToAccounting(id)
        if (res.error) toast.error(res.error)
        else if (res.moved === 0) toast.info("No hay movimientos nuevos para mover.")
        else toast.success(res.moved === 1 ? "1 movimiento movido a Contabilidad." : `${res.moved} movimientos movidos a Contabilidad.`)
      } catch {
        toast.error("No se pudo mover a Contabilidad.")
      }
    })

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={pending}
      onClick={run}
      className="h-8 w-8 text-muted-foreground hover:text-green-600 disabled:opacity-50"
      title="Mover a Contabilidad"
    >
      <BookDown className="h-4 w-4" />
    </Button>
  )
}
