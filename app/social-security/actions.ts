"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { uploadSocialSecurityFile, deleteSocialSecurityFile } from "@/lib/social-security/gcs"
import {
  toSocialSecurityData,
  socialSecurityLabel,
  periodLabel,
  DEFAULT_SOCIAL_SECURITY_MONTHLY,
  type SocialSecurityData,
} from "@/lib/social-security/document-data"
import { extractSocialSecurityFields, SOCIAL_SECURITY_MEDIA_TYPES, BUILDING_NIT } from "@/lib/social-security/extract"
import { AI_REVIEW_THRESHOLD } from "@/lib/accounting/classify"

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const KINDS = ["planilla", "inscripcion"]

async function requireUser() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")
  return user
}

function parseAmount(val: FormDataEntryValue | null | undefined): number | null {
  if (val == null || String(val).trim() === "") return null
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ""))
  return isNaN(n) ? null : n
}

function text(val: FormDataEntryValue | null): string | null {
  const t = (val as string | null)?.trim()
  return t ? t : null
}

function revalidate() {
  revalidatePath("/social-security")
  revalidatePath("/accounting")
}

const INCLUDE_PAYMENTS = {
  accountingRecords: { select: { id: true, date: true, expenses: true, concept: true } },
} as const

export async function listSocialSecurityPayments(): Promise<SocialSecurityData[]> {
  const user = await requireUser()
  const rows = await prisma.socialSecurityPayment.findMany({ where: { userId: user.id }, include: INCLUDE_PAYMENTS })
  return rows.map(toSocialSecurityData).sort((a, b) => a.sortKey.localeCompare(b.sortKey))
}

// What a new planilla is expected to cost: the latest planilla's amount, so fee changes carry over.
export async function getDefaultExpectedAmount(): Promise<number> {
  const user = await requireUser()
  const latest = await prisma.socialSecurityPayment.findFirst({
    where: { userId: user.id, kind: "planilla" },
    orderBy: { period: "desc" },
    select: { expectedAmount: true },
  })
  return latest ? Number(latest.expectedAmount) : DEFAULT_SOCIAL_SECURITY_MONTHLY
}

async function contractorIdFor(userId: string, idNumber: string | null): Promise<string | null> {
  if (!idNumber) return null
  const c = await prisma.contractor.findFirst({ where: { userId, idNumber }, select: { id: true } })
  return c?.id ?? null
}

export async function createSocialSecurityPayment(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const user = await requireUser()

  const kind = (formData.get("kind") as string) || "planilla"
  if (!KINDS.includes(kind)) return { error: "Tipo inválido." }
  const period = text(formData.get("period"))
  if (kind === "planilla" && (!period || !PERIOD_RE.test(period))) return { error: "Elegí el periodo de cotización." }
  const expectedAmount = parseAmount(formData.get("expectedAmount"))
  if (expectedAmount == null || expectedAmount <= 0) return { error: "El valor esperado debe ser mayor a 0." }
  const paidDateStr = text(formData.get("paidDate"))
  const paidDate = paidDateStr ? new Date(paidDateStr) : null
  if (paidDate && isNaN(paidDate.getTime())) return { error: "Fecha de pago inválida." }

  const finalPeriod = kind === "planilla" ? period : null
  if (finalPeriod) {
    const dup = await prisma.socialSecurityPayment.findFirst({ where: { userId: user.id, kind: "planilla", period: finalPeriod } })
    if (dup) return { error: `Ya existe la planilla de ${periodLabel(finalPeriod)}.` }
  }

  let fileName: string | null = null
  let fileUrl: string | null = null
  const file = formData.get("file") as File | null
  if (file && file.size > 0) {
    const ext = file.name.toLowerCase().split(".").pop() ?? ""
    if (!SOCIAL_SECURITY_MEDIA_TYPES[ext]) return { error: "La planilla debe ser PDF, JPG o PNG." }
    try {
      fileUrl = await uploadSocialSecurityFile(Buffer.from(await file.arrayBuffer()), file.name, file.type || "application/octet-stream")
      fileName = file.name
    } catch (err) {
      console.error("[createSocialSecurityPayment] GCS upload error:", err)
      return { error: "No se pudo subir la planilla. Intenta de nuevo." }
    }
  }

  const affiliateIdNumber = text(formData.get("affiliateIdNumber"))
  await prisma.socialSecurityPayment.create({
    data: {
      kind,
      period: finalPeriod,
      expectedAmount,
      planillaNumber: text(formData.get("planillaNumber")),
      planillaTotal: parseAmount(formData.get("planillaTotal")),
      paidDate,
      pensionAmount: parseAmount(formData.get("pensionAmount")),
      healthAmount: parseAmount(formData.get("healthAmount")),
      riskAmount: parseAmount(formData.get("riskAmount")),
      compensationFundAmount: parseAmount(formData.get("compensationFundAmount")),
      affiliateName: text(formData.get("affiliateName")),
      affiliateIdNumber,
      contractorId: await contractorIdFor(user.id, affiliateIdNumber),
      notes: text(formData.get("notes")),
      fileName,
      fileUrl,
      userId: user.id,
    },
  })

  revalidate()
  return { error: null }
}

export async function updateSocialSecurityPayment(
  id: string,
  data: {
    kind?: string
    period?: string | null
    expectedAmount?: number
    planillaNumber?: string | null
    planillaTotal?: number | null
    paidDate?: string | null
    notes?: string | null
  }
): Promise<{ error: string | null }> {
  const user = await requireUser()
  const current = await prisma.socialSecurityPayment.findFirst({ where: { id, userId: user.id } })
  if (!current) return { error: "Registro no encontrado." }

  const updateData: Record<string, unknown> = {}
  const kind = data.kind ?? current.kind
  if (!KINDS.includes(kind)) return { error: "Tipo inválido." }
  if (data.kind !== undefined) updateData.kind = kind
  const period = kind === "inscripcion" ? null : data.period !== undefined ? data.period : current.period
  if (kind === "planilla" && (!period || !PERIOD_RE.test(period))) return { error: "Elegí el periodo de cotización." }
  if (period !== current.period || data.kind !== undefined) {
    if (period) {
      const dup = await prisma.socialSecurityPayment.findFirst({ where: { userId: user.id, kind: "planilla", period, NOT: { id } } })
      if (dup) return { error: `Ya existe la planilla de ${periodLabel(period)}.` }
    }
    updateData.period = period
  }
  if (data.expectedAmount !== undefined) {
    if (!(data.expectedAmount > 0)) return { error: "El valor esperado debe ser mayor a 0." }
    updateData.expectedAmount = data.expectedAmount
  }
  if ("planillaNumber" in data) updateData.planillaNumber = data.planillaNumber?.trim() || null
  if ("planillaTotal" in data) {
    if (data.planillaTotal != null && !(data.planillaTotal >= 0)) return { error: "Total de planilla inválido." }
    updateData.planillaTotal = data.planillaTotal
  }
  if ("paidDate" in data) {
    const d = data.paidDate ? new Date(data.paidDate) : null
    if (d && isNaN(d.getTime())) return { error: "Fecha de pago inválida." }
    updateData.paidDate = d
  }
  if ("notes" in data) updateData.notes = data.notes?.trim() || null

  await prisma.socialSecurityPayment.update({ where: { id }, data: updateData })
  revalidate()
  return { error: null }
}

export async function deleteSocialSecurityPayment(id: string): Promise<{ error: string | null }> {
  const user = await requireUser()
  const entry = await prisma.socialSecurityPayment.findFirst({ where: { id, userId: user.id } })
  if (!entry) return { error: "Registro no encontrado." }
  if (entry.fileUrl) await deleteSocialSecurityFile(entry.fileUrl).catch(console.error)
  // Linked accounting records are kept: onDelete SetNull just unlinks them.
  await prisma.socialSecurityPayment.delete({ where: { id } })
  revalidate()
  return { error: null }
}

export async function uploadSocialSecurityDocument(id: string, formData: FormData): Promise<{ error: string | null }> {
  const user = await requireUser()
  const entry = await prisma.socialSecurityPayment.findFirst({ where: { id, userId: user.id } })
  if (!entry) return { error: "Registro no encontrado." }

  const file = formData.get("file") as File | null
  if (!file || file.size === 0) return { error: "Selecciona un archivo." }
  const ext = file.name.toLowerCase().split(".").pop() ?? ""
  if (!SOCIAL_SECURITY_MEDIA_TYPES[ext]) return { error: "La planilla debe ser PDF, JPG o PNG." }

  try {
    const fileUrl = await uploadSocialSecurityFile(Buffer.from(await file.arrayBuffer()), file.name, file.type || "application/octet-stream")
    if (entry.fileUrl) await deleteSocialSecurityFile(entry.fileUrl).catch(console.error)
    await prisma.socialSecurityPayment.update({ where: { id }, data: { fileName: file.name, fileUrl } })
    revalidate()
    return { error: null }
  } catch (err) {
    console.error("[uploadSocialSecurityDocument] GCS upload error:", err)
    return { error: "No se pudo subir la planilla. Intenta de nuevo." }
  }
}

export async function deleteSocialSecurityDocument(id: string): Promise<{ error: string | null }> {
  const user = await requireUser()
  const entry = await prisma.socialSecurityPayment.findFirst({ where: { id, userId: user.id } })
  if (!entry) return { error: "Registro no encontrado." }
  if (!entry.fileUrl) return { error: null }
  await deleteSocialSecurityFile(entry.fileUrl).catch(console.error)
  await prisma.socialSecurityPayment.update({ where: { id }, data: { fileName: null, fileUrl: null } })
  revalidate()
  return { error: null }
}

export type SocialSecurityExtractionResult = {
  ok: boolean
  error: string | null
  isPlanilla: boolean
  documentKind: string | null
  period: string | null
  planillaNumber: string | null
  planillaTotal: string | null
  paidDate: string | null
  pensionAmount: string | null
  healthAmount: string | null
  riskAmount: string | null
  compensationFundAmount: string | null
  affiliateName: string | null
  affiliateIdNumber: string | null
  warnings: string[]
  lowConfidence: boolean
}

// Read-only, same contract as extractBillFromFile: reads the file with the LLM and returns
// suggested form values. Nothing is uploaded or saved until the user confirms the form.
export async function extractSocialSecurityFromFile(formData: FormData): Promise<SocialSecurityExtractionResult> {
  const user = await requireUser()
  const blank = {
    isPlanilla: false, documentKind: null, period: null, planillaNumber: null, planillaTotal: null,
    paidDate: null, pensionAmount: null, healthAmount: null, riskAmount: null, compensationFundAmount: null,
    affiliateName: null, affiliateIdNumber: null, warnings: [], lowConfidence: true,
  }

  const file = formData.get("file") as File | null
  if (!file || file.size === 0) return { ok: false, error: "Selecciona la planilla primero.", ...blank }
  const mediaType = SOCIAL_SECURITY_MEDIA_TYPES[file.name.toLowerCase().split(".").pop() ?? ""]
  if (!mediaType) return { ok: false, error: "La planilla debe ser PDF, JPG o PNG.", ...blank }
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: "El archivo es muy grande (máx. 8MB).", ...blank }

  const result = await extractSocialSecurityFields(Buffer.from(await file.arrayBuffer()), mediaType, { userId: user.id })
  if (!result.ok || !result.data) return { ok: false, error: result.error ?? "No se pudo leer la planilla.", ...blank }

  const d = result.data
  const warnings: string[] = []
  if (d.isPlanilla && d.employerNit && !d.employerNit.startsWith(BUILDING_NIT)) {
    warnings.push(`El aportante de la planilla (NIT ${d.employerNit}) no es el edificio.`)
  }
  if (d.isPlanilla && d.period) {
    const dup = await prisma.socialSecurityPayment.findFirst({ where: { userId: user.id, kind: "planilla", period: d.period } })
    if (dup) warnings.push(`Ya existe la planilla de ${periodLabel(d.period)}.`)
  }
  const str = (n: number | null) => (n == null ? null : String(n))

  return {
    ok: true,
    error: null,
    isPlanilla: d.isPlanilla,
    documentKind: d.documentKind,
    period: d.period,
    planillaNumber: d.planillaNumber,
    planillaTotal: str(d.total),
    paidDate: d.paidDate,
    pensionAmount: str(d.pension),
    healthAmount: str(d.health),
    riskAmount: str(d.risk),
    compensationFundAmount: str(d.compensationFund),
    affiliateName: d.affiliateName,
    affiliateIdNumber: d.affiliateIdNumber,
    warnings,
    lowConfidence: d.confidence < AI_REVIEW_THRESHOLD,
  }
}

export type SocialSecurityLinkOption = { id: string; label: string; expectedAmount: string; pendingAmount: string }

// Every entry can take more payments (a month may be paid in several transfers), so all are options.
export async function listSocialSecurityLinkOptions(): Promise<SocialSecurityLinkOption[]> {
  const session = await auth()
  if (!session?.user?.email) return []
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return []
  const rows = await prisma.socialSecurityPayment.findMany({ where: { userId: user.id }, include: INCLUDE_PAYMENTS })
  return rows
    .map(toSocialSecurityData)
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
    .map((d) => ({ id: d.id, label: socialSecurityLabel(d.kind, d.period), expectedAmount: d.expectedAmount, pendingAmount: d.pendingAmount }))
}

export async function linkSocialSecurityPayment(recordId: string, paymentId: string): Promise<{ error: string | null }> {
  const user = await requireUser()
  const [record, entry] = await Promise.all([
    prisma.accountingRecord.findFirst({ where: { id: recordId, userId: user.id }, select: { id: true } }),
    prisma.socialSecurityPayment.findFirst({ where: { id: paymentId, userId: user.id }, select: { id: true } }),
  ])
  if (!record) return { error: "Registro contable no encontrado." }
  if (!entry) return { error: "Planilla no encontrada." }
  await prisma.accountingRecord.update({ where: { id: recordId }, data: { socialSecurityPaymentId: paymentId } })
  revalidate()
  return { error: null }
}

export async function unlinkSocialSecurityPayment(recordId: string): Promise<{ error: string | null }> {
  const user = await requireUser()
  await prisma.accountingRecord.updateMany({ where: { id: recordId, userId: user.id }, data: { socialSecurityPaymentId: null } })
  revalidate()
  return { error: null }
}
