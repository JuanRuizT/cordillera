"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

// Colombian-locale formatting: "." groups thousands, "," is the decimal separator.
function formatDisplay(raw: string): string {
  if (raw === "") return ""
  const [intPart, decPart] = raw.split(".")
  const digits = (intPart ?? "").replace(/[^\d]/g, "") || "0"
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return decPart !== undefined ? `${grouped},${decPart}` : grouped
}

// Inverse of formatDisplay: whatever is currently typed (grouped, comma-decimal) back into
// a plain dot-decimal numeric string — the canonical form the rest of the app parses/stores.
function parseTyped(text: string): string {
  const commaIndex = text.indexOf(",")
  if (commaIndex === -1) return text.replace(/[^\d]/g, "")
  const intDigits = text.slice(0, commaIndex).replace(/[^\d]/g, "")
  const decDigits = text.slice(commaIndex + 1).replace(/[^\d]/g, "").slice(0, 2)
  return `${intDigits}.${decDigits}`
}

export interface CurrencyInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  // Canonical value: plain digits with an optional "." decimal separator, e.g. "1500000" or "1500000.5". Empty string = no value.
  value: string
  onChange: (value: string) => void
  // "default" = boxed form field (matches Input). "table" = bare underline, for inline cell editing.
  variant?: "default" | "table"
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, className, variant = "default", ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLInputElement>(null)
    const pendingCursor = React.useRef<number | null>(null)
    const display = formatDisplay(value)

    React.useLayoutEffect(() => {
      if (pendingCursor.current !== null && innerRef.current) {
        innerRef.current.setSelectionRange(pendingCursor.current, pendingCursor.current)
        pendingCursor.current = null
      }
    }, [display])

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const el = e.target
      const prevLength = el.value.length
      const prevCursor = el.selectionStart ?? prevLength
      const newRaw = parseTyped(el.value)
      const newDisplay = formatDisplay(newRaw)
      pendingCursor.current = Math.max(0, prevCursor + (newDisplay.length - prevLength))
      onChange(newRaw)
    }

    return (
      <input
        ref={(el) => {
          innerRef.current = el
          if (typeof forwardedRef === "function") forwardedRef(el)
          else if (forwardedRef) forwardedRef.current = el
        }}
        type="text"
        inputMode="decimal"
        value={display}
        onChange={handleChange}
        className={cn(
          variant === "table"
            ? "w-full bg-transparent outline-none border-b border-primary text-sm"
            : "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        {...props}
      />
    )
  }
)
CurrencyInput.displayName = "CurrencyInput"

export { CurrencyInput }
