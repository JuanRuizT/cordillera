"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { updateContractor, deleteContractor, uploadRut, deleteRut, type ContractorData } from "./actions"
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
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Pencil, Trash2, Paperclip, Loader2, X, Download } from "lucide-react"
import { PhoneInput, formatPhoneDisplay } from "@/components/ui/phone-input"
import { IdNumberInput, formatIdNumberDisplay } from "@/components/ui/id-number-input"
import { EditContractorDialog } from "./edit-contractor-dialog"

function isImageFile(fileName: string | null | undefined) {
  return /\.(jpe?g|png)$/i.test(fileName ?? "")
}

type EditingCell = { id: string; field: string; value: string } | null

const COLUMNS: { field: keyof ContractorData; label: string }[] = [
  { field: "name", label: "Nombre" },
  { field: "idType", label: "Tipo" },
  { field: "idNumber", label: "C.C / NIT" },
  { field: "bankName", label: "Banco" },
  { field: "bankAccount", label: "Cuenta" },
  { field: "bankAccountType", label: "Tipo de Cuenta" },
  { field: "phone", label: "Teléfono" },
  { field: "email", label: "Correo" },
]

export function ContractorsTable({ contractors }: { contractors: ContractorData[] }) {
  const [editing, setEditing] = useState<EditingCell>(null)
  const [, startTransition] = useTransition()
  const [toDelete, setToDelete] = useState<ContractorData | null>(null)
  const [toEdit, setToEdit] = useState<ContractorData | null>(null)
  const [rutTargetId, setRutTargetId] = useState<string | null>(null)
  const [uploadingRutId, setUploadingRutId] = useState<string | null>(null)
  const [deletingRutId, setDeletingRutId] = useState<string | null>(null)
  const [previewRut, setPreviewRut] = useState<ContractorData | null>(null)
  const rutInputRef = useRef<HTMLInputElement>(null)

  const handleRutClick = (c: ContractorData) => {
    if (c.rutFileUrl) {
      setPreviewRut(c)
      return
    }
    setRutTargetId(c.id)
    rutInputRef.current?.click()
  }

  const handleRutFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const targetId = rutTargetId
    e.target.value = ""
    setRutTargetId(null)
    if (!file || !targetId) return
    setUploadingRutId(targetId)
    startTransition(async () => {
      const fd = new FormData()
      fd.append("file", file)
      const result = await uploadRut(targetId, fd)
      setUploadingRutId(null)
      if (result.error) toast.error(result.error)
    })
  }

  const handleDeleteRut = (c: ContractorData) => {
    setDeletingRutId(c.id)
    startTransition(async () => {
      const result = await deleteRut(c.id)
      setDeletingRutId(null)
      if (result.error) toast.error(result.error)
    })
  }

  const commit = () => {
    if (!editing) return
    const snapshot = { ...editing }
    setEditing(null)
    startTransition(async () => {
      await updateContractor(snapshot.id, snapshot.field, snapshot.value)
    })
  }

  const confirmDelete = () => {
    if (!toDelete) return
    const c = toDelete
    setToDelete(null)
    startTransition(async () => {
      const res = await deleteContractor(c.id)
      if (res.error) toast.error(res.error)
      else toast.success("Contratista eliminado.")
    })
  }

  if (contractors.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        No hay contratistas. Crea el primero con &quot;Nuevo contratista&quot;.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <input
        ref={rutInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={handleRutFileChange}
      />
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-muted/50 text-left">
            {COLUMNS.map((c) => (
              <th key={c.field} className="px-4 py-3 font-semibold whitespace-nowrap">{c.label}</th>
            ))}
            <th className="px-4 py-3 font-semibold whitespace-nowrap">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {contractors.map((c, i) => (
            <tr key={c.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
              {COLUMNS.map(({ field }) => {
                const raw = c[field]
                const value = raw == null ? "" : String(raw)
                const isEditing = editing?.id === c.id && editing.field === field
                return (
                  <td
                    key={field}
                    className="px-4 py-2 whitespace-nowrap"
                    onClick={() => { if (!isEditing) setEditing({ id: c.id, field, value }) }}
                  >
                    {isEditing ? (
                      field === "idType" ? (
                        <select
                          autoFocus
                          value={editing.value}
                          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                          onBlur={commit}
                          className="h-8 rounded border border-input bg-background px-1 text-sm"
                        >
                          <option value="CC">CC</option>
                          <option value="NIT">NIT</option>
                        </select>
                      ) : field === "bankAccountType" ? (
                        <select
                          autoFocus
                          value={editing.value}
                          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                          onBlur={commit}
                          className="h-8 rounded border border-input bg-background px-1 text-sm"
                        >
                          <option value="">— Sin especificar —</option>
                          <option value="Ahorros">Ahorros</option>
                          <option value="Corriente">Corriente</option>
                        </select>
                      ) : field === "phone" ? (
                        <PhoneInput
                          autoFocus
                          value={editing.value}
                          onChange={(v) => setEditing({ ...editing, value: v })}
                          onBlur={commit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commit()
                            if (e.key === "Escape") setEditing(null)
                          }}
                          className="h-8 min-w-[160px]"
                        />
                      ) : field === "idNumber" ? (
                        <IdNumberInput
                          autoFocus
                          value={editing.value}
                          onChange={(v) => setEditing({ ...editing, value: v })}
                          onBlur={commit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commit()
                            if (e.key === "Escape") setEditing(null)
                          }}
                          className="h-8 min-w-[140px]"
                        />
                      ) : (
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
                      )
                    ) : (
                      <span className="block min-h-[1.25rem] cursor-text">
                        {value
                          ? field === "phone"
                            ? formatPhoneDisplay(value)
                            : field === "idNumber"
                              ? formatIdNumberDisplay(value)
                              : value
                          : <span className="text-muted-foreground">—</span>}
                      </span>
                    )}
                  </td>
                )
              })}
              <td className="px-4 py-2 text-right">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setToEdit(c)}
                    className="text-muted-foreground hover:text-primary"
                    title="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleRutClick(c)}
                    disabled={uploadingRutId === c.id}
                    className={`disabled:opacity-50 ${c.rutFileUrl ? "text-blue-600 hover:text-blue-700" : "text-muted-foreground hover:text-primary"}`}
                    title={c.rutFileUrl ? `Ver RUT: ${c.rutFileName ?? ""}` : "Adjuntar RUT"}
                  >
                    {uploadingRutId === c.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Paperclip className="h-4 w-4" />}
                  </button>
                  {c.rutFileUrl && (
                    <button
                      onClick={() => handleDeleteRut(c)}
                      disabled={deletingRutId === c.id}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                      title="Quitar RUT"
                    >
                      {deletingRutId === c.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <X className="h-4 w-4" />}
                    </button>
                  )}
                  <button
                    onClick={() => setToDelete(c)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <EditContractorDialog
        contractor={toEdit}
        open={toEdit !== null}
        onClose={() => setToEdit(null)}
      />

      <AlertDialog open={toDelete !== null} onOpenChange={(v) => { if (!v) setToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar contratista</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar a {toDelete?.name}? Esta acción no se puede deshacer.
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

      <Dialog open={previewRut !== null} onOpenChange={(v) => { if (!v) setPreviewRut(null) }}>
        <DialogContent className="w-full max-w-4xl gap-0 p-0">
          <div className="flex items-center justify-between border-b py-2 pl-4 pr-12">
            <DialogTitle className="text-sm font-medium">
              RUT — {previewRut?.rutFileName ?? ""}
            </DialogTitle>
            {previewRut && (
              <a href={`/api/contractors/${previewRut.id}/rut`} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium hover:bg-muted">
                <Download className="h-3.5 w-3.5" /> Descargar
              </a>
            )}
          </div>
          <DialogDescription className="sr-only">Previsualización del RUT</DialogDescription>
          {previewRut && (
            isImageFile(previewRut.rutFileName) ? (
              <div className="flex h-[80vh] w-full items-center justify-center overflow-auto bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/contractors/${previewRut.id}/rut`}
                  alt="RUT"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : (
              <iframe src={`/api/contractors/${previewRut.id}/rut`} title="RUT" className="h-[80vh] w-full" />
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
