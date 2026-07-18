"use client"

import { useActionState, useRef, useEffect } from "react"
import { toast } from "sonner"
import { uploadStatement } from "./actions"

const initialState = { error: null as string | null }

export function UploadExtractoForm() {
  const [state, formAction, isPending] = useActionState(uploadStatement, initialState)
  const formRef = useRef<HTMLFormElement>(null)
  const hasSubmitted = useRef(false)

  useEffect(() => {
    if (!hasSubmitted.current || isPending) return
    hasSubmitted.current = false
    if (state.error) {
      toast.error(state.error)
    } else {
      formRef.current?.reset()
      toast.success("Extracto subido.")
    }
  }, [state, isPending])

  return (
    <form ref={formRef} action={formAction} className="flex items-center gap-3">
      <input
        type="file"
        name="file"
        accept=".xlsx,.xlsm,.xls"
        disabled={isPending}
        className="text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent disabled:opacity-50"
        onChange={() => { hasSubmitted.current = true; formRef.current?.requestSubmit() }}
      />
      {isPending && <p className="text-sm text-muted-foreground">Subiendo...</p>}
    </form>
  )
}
