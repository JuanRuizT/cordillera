export type SocialSecurityKind = "planilla" | "inscripcion"
export type SocialSecurityStatus = "pendiente" | "parcial" | "pagada"

export const SOCIAL_SECURITY_KIND_LABELS: Record<SocialSecurityKind, string> = {
  planilla: "Planilla",
  inscripcion: "Inscripción",
}

// Only used for the very first planilla. Every new planilla copies the expected amount of the
// latest one, so a yearly raise is a single edit and the following months inherit it.
export const DEFAULT_SOCIAL_SECURITY_MONTHLY = 158000

export type SocialSecurityPaymentRow = { id: string; date: string; amount: string; concept: string }

export type SocialSecurityData = {
  id: string
  kind: SocialSecurityKind
  period: string | null // "YYYY-MM"
  label: string // "Septiembre 2026" or "Inscripción"
  expectedAmount: string
  planillaNumber: string | null
  planillaTotal: string | null
  paidDate: string | null
  pensionAmount: string | null
  healthAmount: string | null
  riskAmount: string | null
  compensationFundAmount: string | null
  affiliateName: string | null
  affiliateIdNumber: string | null
  contractorId: string | null
  fileName: string | null
  fileUrl: string | null
  notes: string | null
  paidAmount: string // sum of the linked accounting records' egresos
  pendingAmount: string // expected − paid; negative when more was paid than expected
  status: SocialSecurityStatus
  payments: SocialSecurityPaymentRow[]
  sortKey: string // "YYYY-MM" used to order entries chronologically, inscripciones included
}

type Money = { toString(): string }

export type SocialSecurityRecord = {
  id: string
  kind: string
  period: string | null
  expectedAmount: Money
  planillaNumber: string | null
  planillaTotal: Money | null
  paidDate: Date | null
  pensionAmount: Money | null
  healthAmount: Money | null
  riskAmount: Money | null
  compensationFundAmount: Money | null
  affiliateName: string | null
  affiliateIdNumber: string | null
  contractorId: string | null
  fileName: string | null
  fileUrl: string | null
  notes: string | null
  createdAt: Date
  accountingRecords: { id: string; date: Date; expenses: Money | null; concept: string }[]
}

export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number)
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-CO", { month: "long", timeZone: "UTC" })
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${y}`
}

export function socialSecurityLabel(kind: string, period: string | null): string {
  if (kind === "inscripcion") return SOCIAL_SECURITY_KIND_LABELS.inscripcion
  return period ? periodLabel(period) : SOCIAL_SECURITY_KIND_LABELS.planilla
}

const amountOrNull = (v: Money | null) => (v == null ? null : v.toString())

export function toSocialSecurityData(p: SocialSecurityRecord): SocialSecurityData {
  const kind: SocialSecurityKind = p.kind === "inscripcion" ? "inscripcion" : "planilla"
  const payments = [...p.accountingRecords].sort((a, b) => a.date.getTime() - b.date.getTime())
  // Rounded to cents, same as lib/bills/document-data.ts, so Decimal sums never leave float noise.
  const paid = Math.round(payments.reduce((s, r) => s + Number(r.expenses ?? 0), 0) * 100) / 100
  const expected = Number(p.expectedAmount)
  const pending = Math.round((expected - paid) * 100) / 100
  const status: SocialSecurityStatus = paid <= 0 ? "pendiente" : pending > 0 ? "parcial" : "pagada"
  // An inscripción has no period: order it by when it was paid (or created) instead.
  const sortKey = p.period ?? (payments[0]?.date ?? p.paidDate ?? p.createdAt).toISOString().slice(0, 7)

  return {
    id: p.id,
    kind,
    period: p.period,
    label: socialSecurityLabel(kind, p.period),
    expectedAmount: p.expectedAmount.toString(),
    planillaNumber: p.planillaNumber,
    planillaTotal: amountOrNull(p.planillaTotal),
    paidDate: p.paidDate?.toISOString() ?? null,
    pensionAmount: amountOrNull(p.pensionAmount),
    healthAmount: amountOrNull(p.healthAmount),
    riskAmount: amountOrNull(p.riskAmount),
    compensationFundAmount: amountOrNull(p.compensationFundAmount),
    affiliateName: p.affiliateName,
    affiliateIdNumber: p.affiliateIdNumber,
    contractorId: p.contractorId,
    fileName: p.fileName,
    fileUrl: p.fileUrl,
    notes: p.notes,
    paidAmount: paid.toString(),
    pendingAmount: pending.toString(),
    status,
    payments: payments.map((r) => ({
      id: r.id,
      date: r.date.toISOString(),
      amount: (r.expenses ?? 0).toString(),
      concept: r.concept,
    })),
    sortKey,
  }
}
