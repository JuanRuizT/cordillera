"use client"

import { useState, useRef, useEffect } from "react"
import { ChevronDown, X } from "lucide-react"
import { ACCOUNTING_CATEGORIES } from "@/lib/accounting/categories"

export { ACCOUNTING_CATEGORIES }

interface CategoryComboboxProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  variant?: "table" | "form"
  options?: readonly string[]
}

export function CategoryCombobox({
  value = "",
  onChange,
  placeholder,
  variant = "form",
  options = ACCOUNTING_CATEGORIES,
}: CategoryComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const filtered = options.filter((c) =>
    c.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    if (!open) return
    setSearch("")
    const id = setTimeout(() => searchRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [open])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  const handleSelect = (cat: string) => {
    onChange?.(cat)
    setOpen(false)
  }

  const hasValue = Boolean(value)

  const dropdown = open && (
    <div className="absolute z-50 left-0 top-full mt-1 w-52 rounded-md border bg-popover text-popover-foreground shadow-md">
      <div className="p-1 border-b border-border">
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.stopPropagation(); setOpen(false) }
            if (e.key === "Enter" && filtered.length > 0) handleSelect(filtered[0])
          }}
          placeholder="Search..."
          className="w-full text-sm px-2 py-1 outline-none bg-transparent placeholder:text-muted-foreground"
        />
      </div>
      <ul className="max-h-48 overflow-y-auto py-1">
        {hasValue && (
          <li
            onPointerDown={(e) => { e.preventDefault(); handleSelect("") }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer text-muted-foreground hover:bg-accent hover:text-accent-foreground border-b border-border mb-1"
          >
            <X className="h-3 w-3" />
            Borrar
          </li>
        )}
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-sm text-muted-foreground">No results</li>
        ) : filtered.map((cat) => (
          <li
            key={cat}
            onPointerDown={(e) => { e.preventDefault(); handleSelect(cat) }}
            className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground ${value === cat ? "font-medium" : ""}`}
          >
            {cat}
          </li>
        ))}
      </ul>
    </div>
  )

  if (variant === "table") {
    return (
      <div ref={containerRef} className="relative">
        <span
          onClick={() => setOpen((o) => !o)}
          title="Click to change category"
          className={`block min-w-[80px] cursor-pointer select-none hover:text-primary ${hasValue ? "" : "text-muted-foreground"}`}
        >
          {value || placeholder || "—"}
        </span>
        {dropdown}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className={hasValue ? "" : "text-muted-foreground"}>
          {value || "Select category..."}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
      </button>
      {dropdown}
    </div>
  )
}
