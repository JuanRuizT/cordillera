"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

const COUNTRY_CODE = "+57"

// Canonical value is "+57" + up to 10 local digits, e.g. "+573117196705", or "" if empty.
// Best-effort on legacy data: if what's stored already starts with "57", drop that prefix
// before treating the rest as local digits (avoids double-prefixing old free-text values).
function localDigits(value: string): string {
  let digits = value.replace(/[^\d]/g, "")
  if (digits.startsWith("57") && digits.length > 10) digits = digits.slice(2)
  return digits.slice(0, 10)
}

function formatLocal(digits: string): string {
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)].filter(Boolean).join(" ")
}

// For read-only display elsewhere (e.g. a table cell): "+573117196705" -> "+57 311 719 6705".
// Falls back to the raw stored value untouched if it doesn't look like a +57 number, so old
// free-text data (landlines, extensions, etc.) doesn't get mangled.
export function formatPhoneDisplay(value: string): string {
  if (!value) return ""
  const digits = localDigits(value)
  if (digits.length !== 10) return value
  return `${COUNTRY_CODE} ${formatLocal(digits)}`
}

export interface PhoneInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  value: string
  onChange: (value: string) => void
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, className, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLInputElement>(null)
    const pendingCursor = React.useRef<number | null>(null)
    const display = formatLocal(localDigits(value))

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
      const digits = el.value.replace(/[^\d]/g, "").slice(0, 10)
      const newDisplay = formatLocal(digits)
      pendingCursor.current = Math.max(0, prevCursor + (newDisplay.length - prevLength))
      onChange(digits ? `${COUNTRY_CODE}${digits}` : "")
    }

    return (
      <div
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring",
          className
        )}
      >
        <span className="flex select-none items-center rounded-l-md border-r border-input bg-muted px-3 text-sm text-muted-foreground">
          {COUNTRY_CODE}
        </span>
        <input
          ref={(el) => {
            innerRef.current = el
            if (typeof forwardedRef === "function") forwardedRef(el)
            else if (forwardedRef) forwardedRef.current = el
          }}
          type="tel"
          inputMode="numeric"
          value={display}
          onChange={handleChange}
          placeholder="311 719 6705"
          className="min-w-0 flex-1 rounded-r-md bg-transparent px-3 py-1 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          {...props}
        />
      </div>
    )
  }
)
PhoneInput.displayName = "PhoneInput"

export { PhoneInput }
