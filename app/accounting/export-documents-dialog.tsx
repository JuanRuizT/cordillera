"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle, CheckCircle2, FileArchive, Loader2 } from "lucide-react"
import { todayStamp } from "@/lib/date-format"

type Preview = { fileCount: number; included: number; skipped: number; missingFiles: number }
type Result = { included: number; skipped: number; missingFiles: number }
type Phase = "loading" | "confirm" | "downloading" | "done" | "error"

function plural(n: number, singular: string, plural: string) {
  return n === 1 ? singular : plural
}

// Two-step "Descargar documentos": a preflight count the user confirms before anything is
// downloaded, then a results screen with the real numbers once the ZIP has actually been built —
// the preflight and the final count can differ slightly (e.g. a transient GCS read failure only
// shows up once the download is actually attempted).
export function ExportDocumentsDialog({
  ids,
  onOpenChange,
}: {
  ids: string[] | null
  onOpenChange: (open: boolean) => void
}) {
  const open = ids !== null
  const [phase, setPhase] = useState<Phase>("loading")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !ids) return
    let active = true
    setPhase("loading")
    setPreview(null)
    setResult(null)
    setErrorMsg(null)

    fetch("/api/accounting/export-documents/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error ?? "No se pudo calcular la vista previa.")
        }
        return res.json() as Promise<Preview>
      })
      .then((data) => {
        if (!active) return
        setPreview(data)
        setPhase("confirm")
      })
      .catch((err) => {
        if (!active) return
        setErrorMsg(err instanceof Error ? err.message : "No se pudo calcular la vista previa.")
        setPhase("error")
      })

    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ids` is a fresh array each render; only re-run when the dialog opens
  }, [open])

  const handleConfirm = async () => {
    if (!ids) return
    setPhase("downloading")
    try {
      const res = await fetch("/api/accounting/export-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? "No se pudo exportar los documentos.")
      }

      const included = Number(res.headers.get("X-Export-Included") ?? "0")
      const skipped = Number(res.headers.get("X-Export-Skipped") ?? "0")
      const missingFiles = Number(res.headers.get("X-Export-Missing-Files") ?? "0")

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `documentos-contabilidad-${todayStamp()}.zip`
      a.click()
      URL.revokeObjectURL(url)

      setResult({ included, skipped, missingFiles })
      setPhase("done")
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "No se pudo exportar los documentos.")
      setPhase("error")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onOpenChange(false) }}>
      <DialogContent className="max-w-md p-6">
        <div className="flex flex-col gap-1.5">
          <DialogTitle className="flex items-center gap-2">
            <FileArchive className="h-4.5 w-4.5 text-muted-foreground" />
            Descargar documentos
          </DialogTitle>
          <DialogDescription className="sr-only">Confirmación y resultado de la descarga de documentos en ZIP</DialogDescription>
        </div>

        {phase === "loading" && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Calculando qué se va a descargar…
          </div>
        )}

        {phase === "confirm" && preview && (
          <div className="flex flex-col gap-4 py-2">
            <p className="text-sm">
              Se descargarán{" "}
              <span className="font-medium text-foreground">
                {preview.fileCount} {plural(preview.fileCount, "archivo", "archivos")}
              </span>{" "}
              de{" "}
              <span className="font-medium text-foreground">
                {preview.included} {plural(preview.included, "registro", "registros")}
              </span>{" "}
              en un ZIP.
            </p>
            {preview.skipped > 0 && (
              <p className="text-sm text-muted-foreground">
                {preview.skipped} {plural(preview.skipped, "registro se omitirá", "registros se omitirán")} por no tener documentos.
              </p>
            )}
            {preview.missingFiles > 0 && (
              <p className="flex items-start gap-1.5 text-sm text-amber-600 dark:text-amber-500">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {preview.missingFiles} {plural(preview.missingFiles, "documento no tiene", "documentos no tienen")} archivo en el bucket y se omitirán.
              </p>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleConfirm} disabled={preview.fileCount === 0}>Descargar</Button>
            </div>
          </div>
        )}

        {phase === "downloading" && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Descargando…
          </div>
        )}

        {phase === "done" && result && (
          <div className="flex flex-col gap-4 py-2">
            <p className="flex items-start gap-1.5 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-500" />
              Listo — {result.included} {plural(result.included, "registro descargado", "registros descargados")}.
            </p>
            {result.skipped > 0 && (
              <p className="text-sm text-muted-foreground">
                {result.skipped} {plural(result.skipped, "registro omitido", "registros omitidos")} por no tener documentos.
              </p>
            )}
            {result.missingFiles > 0 && (
              <p className="flex items-start gap-1.5 text-sm text-amber-600 dark:text-amber-500">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {result.missingFiles} {plural(result.missingFiles, "documento", "documentos")} no {plural(result.missingFiles, "tenía", "tenían")} archivo en el bucket y se {plural(result.missingFiles, "omitió", "omitieron")}.
              </p>
            )}
            <div className="mt-2 flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="flex flex-col gap-4 py-2">
            <p className="flex items-start gap-1.5 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {errorMsg}
            </p>
            <div className="mt-2 flex justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
