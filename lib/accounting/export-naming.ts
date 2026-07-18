// Filename/path conventions for the "Descargar documentos" ZIP export. Kept separate from
// export-documents.ts so the naming rules can be read/tested on their own.

export function pad4(n: number): string {
  return String(n).padStart(4, "0")
}

// Windows-invalid path characters, plus control chars — a ZIP entry with any of these fails to
// extract cleanly on Windows even though the ZIP format itself would allow them.
const INVALID_CHARS = /[\\/:*?"<>|\x00-\x1f]/g
// Windows Explorer's built-in zip viewer chokes (with a generic "compressed folder is invalid"
// error) on entries whose combined path exceeds the classic ~260-char MAX_PATH — and cuenta de
// cobro entries are nested one level ("<folder>/<file>"), so both the folder name (invoiceBaseName)
// and the filename inside it (voucherBaseName + " - Comprobante de pago NN" + ext) draw from this
// same cap. 80 keeps folder + "/" + file comfortably under 200 chars even in the worst case,
// leaving headroom for whatever destination path the user extracts into.
const MAX_SEGMENT_LENGTH = 80

export function sanitizeSegment(s: string): string {
  const cleaned = s.replace(INVALID_CHARS, " ").replace(/\s+/g, " ").trim()
  return cleaned.length > MAX_SEGMENT_LENGTH ? cleaned.slice(0, MAX_SEGMENT_LENGTH).trim() : cleaned
}

export function dateStamp(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// Extension (with leading dot, lowercased) inferred from an original filename. Falls back to
// .pdf for the generated documents, whose filename we control.
export function extOf(fileName: string | null | undefined, fallback = ".pdf"): string {
  if (!fileName) return fallback
  const idx = fileName.lastIndexOf(".")
  if (idx === -1) return fallback
  return fileName.slice(idx).toLowerCase()
}

export function receiptBaseName(opts: { number: number; date: Date; concept: string; property: string | null }): string {
  const parts = [pad4(opts.number), "Recibo de Caja", dateStamp(opts.date), opts.concept]
  if (opts.property) parts.push(opts.property)
  return sanitizeSegment(parts.join(" "))
}

export function voucherBaseName(opts: { number: number; date: Date; concept: string }): string {
  return sanitizeSegment([pad4(opts.number), "Comprobante de Egreso", dateStamp(opts.date), opts.concept].join(" "))
}

// Used both as the cuenta de cobro folder name and as the filename of the generated PDF inside it.
export function invoiceBaseName(opts: { number: number; date: Date; concept: string }): string {
  return sanitizeSegment([pad4(opts.number), "Cuenta de Cobro", dateStamp(opts.date), opts.concept].join(" "))
}

// A record with attachments (bill, comprobante de pago) but no generated document of its own
// — e.g. a plain Egreso with no cuenta de cobro and no comprobante de egreso yet.
export function plainRecordBaseName(opts: { date: Date; concept: string; property: string | null }): string {
  const parts = [dateStamp(opts.date), opts.concept]
  if (opts.property) parts.push(opts.property)
  return sanitizeSegment(parts.join(" "))
}

export function attachmentName(base: string, kind: string, ext: string, index?: number): string {
  const label = index != null ? `${kind} ${index}` : kind
  return `${base} - ${label}${ext}`
}

// Appends " (2)", " (3)"... right before the extension if `name` (or path) was already used —
// guards against two documents landing on the same filename inside one folder (or the ZIP root).
export function dedupeName(used: Set<string>, name: string): string {
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  const dot = name.lastIndexOf(".")
  const base = dot === -1 ? name : name.slice(0, dot)
  const ext = dot === -1 ? "" : name.slice(dot)
  let n = 2
  let candidate = `${base} (${n})${ext}`
  while (used.has(candidate)) {
    n++
    candidate = `${base} (${n})${ext}`
  }
  used.add(candidate)
  return candidate
}
