"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Eye, Trash2, Paperclip, Loader2, FileText, Image as ImageIcon, Download } from "lucide-react"
import { uploadPaymentProof, deletePaymentProof, type PaymentProofRow } from "./actions"

function isImageFile(fileName: string) {
  return /\.(jpe?g|png)$/i.test(fileName)
}

interface Props {
  accountingRecordId: string | null
  proofs: PaymentProofRow[]
  open: boolean
  onClose: () => void
  onChanged: () => void
}

// Shared by Contabilidad and the Abonos modal — both manage the same AccountingRecord's payment
// proofs, just refresh their own data differently after a change (onChanged lets each caller
// decide: Contabilidad relies on Next's automatic revalidatePath refresh, Abonos re-fetches).
export function PaymentProofsDialog({ accountingRecordId, proofs, open, onClose, onChanged }: Props) {
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [previewProof, setPreviewProof] = useState<PaymentProofRow | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ""
    if (files.length === 0 || !accountingRecordId) return
    setUploading(true)
    let successCount = 0
    // Sequential on purpose — keeps GCS/DB writes predictable and lets us show real progress
    // instead of firing every upload at once.
    for (let i = 0; i < files.length; i++) {
      setUploadProgress({ done: i, total: files.length })
      const fd = new FormData()
      fd.append("file", files[i])
      const res = await uploadPaymentProof(accountingRecordId, fd)
      if (res.error) toast.error(`${files[i].name}: ${res.error}`)
      else successCount++
    }
    setUploadProgress(null)
    setUploading(false)
    if (successCount > 0) {
      toast.success(successCount === 1 ? "Comprobante de pago subido." : `${successCount} comprobantes de pago subidos.`)
      onChanged()
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    const res = await deletePaymentProof(id)
    setDeletingId(null)
    if (res.error) toast.error(res.error)
    else {
      toast.success("Comprobante de pago eliminado.")
      onChanged()
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
        <DialogContent className="max-w-md p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-0.5">
              <DialogTitle className="text-base">Comprobantes de pago</DialogTitle>
              <DialogDescription>
                {proofs.length === 0
                  ? "Todavía no hay archivos adjuntos"
                  : `${proofs.length} ${proofs.length === 1 ? "archivo adjunto" : "archivos adjuntos"}`}
              </DialogDescription>
            </div>
          </div>

          <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" multiple className="hidden" onChange={handleFileChange} />

          <div className="mt-4 flex flex-col gap-4">
            {proofs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">Sin comprobantes adjuntos.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {proofs.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-md border px-3 py-2 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      {isImageFile(p.fileName)
                        ? <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        : <FileText className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreviewProof(p)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left text-sm font-medium hover:text-blue-600 hover:underline"
                      title={p.fileName}
                    >
                      <span className="truncate">{p.fileName}</span>
                      <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={deletingId === p.id}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      title="Quitar"
                    >
                      {deletingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading || !accountingRecordId}
              className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              {uploading
                ? (uploadProgress && uploadProgress.total > 1 ? `Subiendo ${uploadProgress.done + 1}/${uploadProgress.total}…` : "Subiendo…")
                : "Adjuntar archivos"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={previewProof !== null} onOpenChange={(v) => { if (!v) setPreviewProof(null) }}>
        <DialogContent className="w-full max-w-4xl gap-0 p-0">
          <div className="flex items-center justify-between border-b py-2 pl-4 pr-12">
            <DialogTitle className="text-sm font-medium">
              Comprobante de pago — {previewProof?.fileName ?? ""}
            </DialogTitle>
            {previewProof && (
              <a
                href={`/api/accounting/payment-proof/${previewProof.id}`}
                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5" /> Descargar
              </a>
            )}
          </div>
          <DialogDescription className="sr-only">Previsualización del comprobante de pago</DialogDescription>
          {previewProof && (
            isImageFile(previewProof.fileName) ? (
              <div className="flex h-[80vh] w-full items-center justify-center overflow-auto bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/accounting/payment-proof/${previewProof.id}`}
                  alt="Comprobante de pago"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : (
              <iframe src={`/api/accounting/payment-proof/${previewProof.id}`} title="Comprobante de pago" className="h-[80vh] w-full" />
            )
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
