"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

// Colombian-locale formatting for cédula/NIT numbers: "." groups every 3 digits, e.g. "1.053.791.953".
function formatDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

// For read-only display elsewhere (e.g. a table cell): "1053791953" -> "1.053.791.953".
// Falls back to the raw value untouched if it isn't purely numeric.
export function formatIdNumberDisplay(value: string): string {
  if (!value) return ""
  const digits = value.replace(/[^\d]/g, "")
  if (!digits || digits.length !== value.length) return value
  return formatDigits(digits)
}

export interface IdNumberInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  // Canonical value: plain digits, e.g. "1053791953". Empty string = no value.
  value: string
  onChange: (value: string) => void
  // "default" = boxed form field (matches Input). "table" = bare underline, for inline cell editing.
  variant?: "default" | "table"
}

const IdNumberInput = React.forwardRef<HTMLInputElement, IdNumberInputProps>(
  ({ value, onChange, className, variant = "default", ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLInputElement>(null)
    const pendingCursor = React.useRef<number | null>(null)
    const display = formatDigits(value.replace(/[^\d]/g, ""))

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
      const newDigits = el.value.replace(/[^\d]/g, "")
      const newDisplay = formatDigits(newDigits)
      pendingCursor.current = Math.max(0, prevCursor + (newDisplay.length - prevLength))
      onChange(newDigits)
    }

    return (
      <input
        ref={(el) => {
          innerRef.current = el
          if (typeof forwardedRef === "function") forwardedRef(el)
          else if (forwardedRef) forwardedRef.current = el
        }}
        type="text"
        inputMode="numeric"
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
IdNumberInput.displayName = "IdNumberInput"

export { IdNumberInput }
