"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: { value: string; label: string; title?: string }[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const toggle = (value: string) => {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }

  return (
    <div ref={ref} className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
        {label}
        {selected.size > 0 && <span className="text-muted-foreground">({selected.size})</span>}
      </Button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-56 overflow-auto rounded-md border bg-popover p-2 shadow-md">
          {options.length > 1 && (
            <div className="flex gap-1 border-b pb-2 mb-1">
              <button
                onClick={() => onChange(new Set(options.map((o) => o.value)))}
                className="flex-1 rounded px-2 py-1 text-xs hover:bg-muted"
              >
                Todas
              </button>
              <button onClick={() => onChange(new Set())} className="flex-1 rounded px-2 py-1 text-xs hover:bg-muted">
                Ninguna
              </button>
            </div>
          )}
          {options.map((opt) => (
            <label
              key={opt.value}
              title={opt.title ?? opt.label}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selected.has(opt.value)}
                onChange={() => toggle(opt.value)}
                className="h-4 w-4 shrink-0"
              />
              <span className="truncate">{opt.label}</span>
            </label>
          ))}
          {options.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Sin opciones</p>}
        </div>
      )}
    </div>
  )
}
