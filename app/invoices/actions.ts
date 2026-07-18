"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { uploadInvoiceFile, deleteInvoiceFile } from "@/lib/invoices/gcs"
import { extractInvoiceFields } from "@/lib/invoices/extract"
import { AI_REVIEW_THRESHOLD } from "@/lib/accounting/classify"
import { computeInvoiceFinancials } from "@/lib/invoice-financials"

// Por ley, la retención en la fuente solo puede ser 4% o 6%.
// Kept in sync with the dropdown options in add-invoice-form.tsx, edit-invoice-dialog.tsx and invoices-table.tsx.
const VALID_RETENTION_RATES = [4, 6]

export type InvoiceData = {
  id: string
  number: number | null
  contractorId: string
  contractorName: string
  contractorIdNumber: string
  date: string
  concept: string
  totalAmount: string
  retentionRate: number | null
  retentionAmount: string
  netAmount: string
  paid: string
  pending: string
  bankInfo: string | null
  fileName: string | null
  fileUrl: string | null
  notes: string | null
  abonos: Array<{ id: string; date: string; amount: string; voucherNumber: number | null }>
}

export type OpenInvoice = {
  id: string
  concept: string
  totalAmount: string
  pending: string
}

async function requireUser() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")
  return user
}

function parseAmount(val: FormDataEntryValue | null): number | null {
  if (!val) return null
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ""))
  return isNaN(n) ? null : n
}

type AbonoWithRecord = {
  id: string
  date: Date | null
  amount: { toString(): string } | null
  accountingRecord: {
    date: Date
    expenses: { toString(): string } | null
    expenseVoucher: { number: number } | null
  } | null
}

type InvoiceWithAbonos = {
  id: string
  number: number | null
  contractorId: string
  contractor: { name: string; idNumber: string }
  date: Date
  concept: string
  totalAmount: { toString(): string }
  retentionRate: { toString(): string } | null
  bankInfo: string | null
  fileName: string | null
  fileUrl: string | null
  notes: string | null
  abonos: AbonoWithRecord[]
}

// The abono's own date/amount are only used for manual abonos (no linked record) — the DB
// CHECK constraint guarantees they're set whenever accountingRecordId is null.
function toInvoiceData(inv: InvoiceWithAbonos): InvoiceData {
  const total = Number(inv.totalAmount)
  const rate = inv.retentionRate != null ? Number(inv.retentionRate) : null
  const paid = inv.abonos.reduce(
    (s, a) => s + (a.accountingRecord ? Number(a.accountingRecord.expenses ?? 0) : Number(a.amount!)),
    0
  )
  const { retentionAmount, netAmount, pending } = computeInvoiceFinancials(total, rate, paid)
  return {
    id: inv.id,
    number: inv.number,
    contractorId: inv.contractorId,
    contractorName: inv.contractor.name,
    contractorIdNumber: inv.contractor.idNumber,
    date: inv.date.toISOString(),
    concept: inv.concept,
    totalAmount: total.toString(),
    retentionRate: rate,
    retentionAmount: retentionAmount.toString(),
    netAmount: netAmount.toString(),
    paid: paid.toString(),
    pending: pending.toString(),
    bankInfo: inv.bankInfo,
    fileName: inv.fileName,
    fileUrl: inv.fileUrl,
    notes: inv.notes,
    abonos: inv.abonos.map((a) => ({
      id: a.id,
      date: (a.accountingRecord?.date ?? a.date!).toISOString(),
      amount: (a.accountingRecord ? (a.accountingRecord.expenses ?? 0) : a.amount!).toString(),
      voucherNumber: a.accountingRecord?.expenseVoucher?.number ?? null,
    })),
  }
}

export async function listInvoices(): Promise<InvoiceData[]> {
  const session = await auth()
  if (!session?.user?.email) return []
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return []

  const invoices = await prisma.invoice.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    include: {
      contractor: { select: { name: true, idNumber: true } },
      abonos: {
        select: {
          id: true,
          date: true,
          amount: true,
          accountingRecord: { select: { date: true, expenses: true, expenseVoucher: { select: { number: true } } } },
        },
        orderBy: { date: "asc" },
      },
    },
  })

  return invoices.map(toInvoiceData)
}

export async function listOpenInvoicesByContractor(contractorId: string): Promise<OpenInvoice[]> {
  const session = await auth()
  if (!session?.user?.email) return []
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return []

  const invoices = await prisma.invoice.findMany({
    where: { userId: user.id, contractorId },
    orderBy: { date: "desc" },
    include: { abonos: { select: { amount: true, accountingRecord: { select: { expenses: true } } } } },
  })

  return invoices
    .map((inv) => {
      const total = Number(inv.totalAmount)
      const rate = inv.retentionRate != null ? Number(inv.retentionRate) : null
      const paid = inv.abonos.reduce(
        (s, a) => s + (a.accountingRecord ? Number(a.accountingRecord.expenses ?? 0) : Number(a.amount!)),
        0
      )
      const { pending } = computeInvoiceFinancials(total, rate, paid)
      return { id: inv.id, concept: inv.concept, totalAmount: total.toString(), pending: pending.toString() }
    })
    .filter((inv) => Number(inv.pending) > 0)
}

export type OpenInvoiceOption = {
  id: string
  contractorName: string
  concept: string
  pending: string
}

export async function listOpenInvoices(): Promise<OpenInvoiceOption[]> {
  const session = await auth()
  if (!session?.user?.email) return []
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return []

  const invoices = await prisma.invoice.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    include: {
      contractor: { select: { name: true } },
      abonos: { select: { amount: true, accountingRecord: { select: { expenses: true } } } },
    },
  })

  return invoices
    .map((inv) => {
      const total = Number(inv.totalAmount)
      const rate = inv.retentionRate != null ? Number(inv.retentionRate) : null
      const paid = inv.abonos.reduce(
        (s, a) => s + (a.accountingRecord ? Number(a.accountingRecord.expenses ?? 0) : Number(a.amount!)),
        0
      )
      const { pending } = computeInvoiceFinancials(total, rate, paid)
      return { id: inv.id, contractorName: inv.contractor.name, concept: inv.concept, pending: pending.toString() }
    })
    .filter((inv) => Number(inv.pending) > 0)
}

export type AbonoRow = {
  id: string
  date: string
  concept: string
  amount: string
  voucherNumber: number | null
  source: "record" | "manual"
}

export async function listInvoiceAbonos(invoiceId: string): Promise<AbonoRow[]> {
  const session = await auth()
  if (!session?.user?.email) return []
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return []

  const abonos = await prisma.abono.findMany({
    where: { invoiceId, userId: user.id },
    orderBy: { date: "asc" },
    include: { accountingRecord: { include: { expenseVoucher: { select: { number: true } } } } },
  })

  return abonos.map((a) => ({
    id: a.id,
    date: (a.accountingRecord?.date ?? a.date!).toISOString(),
    concept: a.accountingRecord?.concept ?? a.concept!,
    amount: (a.accountingRecord ? (a.accountingRecord.expenses ?? 0) : a.amount!).toString(),
    voucherNumber: a.accountingRecord?.expenseVoucher?.number ?? null,
    source: a.accountingRecordId ? "record" : "manual",
  }))
}

export async function listLinkableEgresos(): Promise<AbonoRow[]> {
  const session = await auth()
  if (!session?.user?.email) return []
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return []

  const records = await prisma.accountingRecord.findMany({
    where: { userId: user.id, category: "Egreso", abono: null },
    orderBy: { date: "desc" },
  })

  return records.map((r) => ({
    id: r.id,
    date: r.date.toISOString(),
    concept: r.concept,
    amount: (r.expenses ?? 0).toString(),
    voucherNumber: null,
    source: "record",
  }))
}

export async function linkEgreso(recordId: string, invoiceId: string): Promise<{ error: string | null }> {
  const user = await requireUser()
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, userId: user.id } })
  if (!invoice) return { error: "Cuenta de cobro no encontrada." }
  await prisma.abono.upsert({
    where: { accountingRecordId: recordId },
    create: { invoiceId, accountingRecordId: recordId, userId: user.id },
    update: { invoiceId },
  })
  revalidatePath("/invoices")
  revalidatePath("/accounting")
  return { error: null }
}

export async function unlinkEgreso(recordId: string): Promise<{ error: string | null }> {
  const user = await requireUser()
  // deleteMany (not delete) — this can be called on a record that's already unlinked
  // (e.g. LinkInvoiceDialog saved with no selection), which must be a harmless no-op.
  await prisma.abono.deleteMany({ where: { accountingRecordId: recordId, userId: user.id } })
  revalidatePath("/invoices")
  revalidatePath("/accounting")
  return { error: null }
}

export async function addManualAbono(
  invoiceId: string,
  data: { date: string; amount: number; concept: string }
): Promise<{ error: string | null }> {
  const user = await requireUser()
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, userId: user.id } })
  if (!invoice) return { error: "Cuenta de cobro no encontrada." }

  const concept = data.concept.trim()
  if (!concept) return { error: "El concepto es requerido." }
  if (!data.amount || data.amount <= 0) return { error: "El monto debe ser mayor a 0." }
  const date = new Date(data.date)
  if (isNaN(date.getTime())) return { error: "Fecha inválida." }

  await prisma.abono.create({
    data: { invoiceId, date, amount: data.amount, concept, userId: user.id },
  })

  revalidatePath("/invoices")
  return { error: null }
}

export async function deleteManualAbono(id: string): Promise<{ error: string | null }> {
  const user = await requireUser()
  await prisma.abono.delete({ where: { id, userId: user.id } })
  revalidatePath("/invoices")
  return { error: null }
}

export async function createInvoice(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const user = await requireUser()

  const contractorId = (formData.get("contractorId") as string)?.trim()
  if (!contractorId) return { error: "Selecciona un contratista." }
  const concept = (formData.get("concept") as string)?.trim()
  if (!concept) return { error: "El concepto es requerido." }
  const total = parseAmount(formData.get("totalAmount"))
  if (total == null || total <= 0) return { error: "El total debe ser mayor a 0." }
  const dateStr = formData.get("date") as string
  if (!dateStr) return { error: "La fecha es requerida." }
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return { error: "Fecha inválida." }

  const retentionRateStr = (formData.get("retentionRate") as string)?.trim()
  const retentionRate = retentionRateStr ? parseFloat(retentionRateStr) : null
  if (retentionRate != null && !VALID_RETENTION_RATES.includes(retentionRate)) {
    return { error: "La retención en la fuente solo puede ser 4% o 6%." }
  }

  const contractor = await prisma.contractor.findUnique({ where: { id: contractorId, userId: user.id } })
  if (!contractor) return { error: "Contratista no encontrado." }

  const numberStr = (formData.get("number") as string)?.trim()
  let number: number
  if (numberStr) {
    const n = parseInt(numberStr, 10)
    if (isNaN(n) || n < 1 || String(n) !== numberStr) return { error: "El número debe ser un entero positivo." }
    const conflict = await prisma.invoice.findFirst({ where: { number: n, userId: user.id } })
    if (conflict) return { error: `Ya existe la cuenta de cobro N° ${String(n).padStart(4, "0")}.` }
    number = n
  } else {
    const last = await prisma.invoice.findFirst({
      where: { userId: user.id, number: { not: null } },
      orderBy: { number: "desc" },
      select: { number: true },
    })
    number = (last?.number ?? 0) + 1
  }

  let fileName: string | null = null
  let fileUrl: string | null = null
  const file = formData.get("file") as File | null
  if (file && file.size > 0) {
    if (!file.name.toLowerCase().endsWith(".pdf")) return { error: "El adjunto debe ser un PDF." }
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      fileUrl = await uploadInvoiceFile(buffer, file.name)
      fileName = file.name
    } catch (err) {
      console.error("[createInvoice] GCS upload error:", err)
      return { error: "No se pudo subir el PDF. Intenta de nuevo." }
    }
  }

  await prisma.invoice.create({
    data: {
      number,
      contractorId,
      date,
      concept,
      totalAmount: total,
      retentionRate,
      bankInfo: (formData.get("bankInfo") as string)?.trim() || null,
      notes: (formData.get("notes") as string)?.trim() || null,
      fileName,
      fileUrl,
      userId: user.id,
    },
  })

  revalidatePath("/invoices")
  return { error: null }
}

// Preview of the number createInvoice will auto-assign if the form doesn't override it.
export async function getNextInvoiceNumber(): Promise<number> {
  const user = await requireUser()
  const last = await prisma.invoice.findFirst({
    where: { userId: user.id, number: { not: null } },
    orderBy: { number: "desc" },
    select: { number: true },
  })
  return (last?.number ?? 0) + 1
}

export type InvoiceExtractionResult = {
  ok: boolean
  error: string | null
  concept: string | null
  totalAmount: string | null
  date: string | null
  retentionRate: number | null
  bankInfo: string | null
  contractorName: string | null
  contractorIdNumber: string | null
  matchedContractorId: string | null
  confidence: number
  lowConfidence: boolean
}

// Read-only: extracts fields from an uploaded PDF via the LLM and looks up a matching
// contractor by exact idNumber. Does not touch GCS or write to the DB — the PDF is uploaded
// and the Invoice row is created only when the user confirms via createInvoice.
export async function extractInvoiceFromPdf(formData: FormData): Promise<InvoiceExtractionResult> {
  const user = await requireUser()
  const blank = {
    concept: null, totalAmount: null, date: null, retentionRate: null,
    bankInfo: null, contractorName: null, contractorIdNumber: null,
    matchedContractorId: null, confidence: 0, lowConfidence: true,
  }

  const file = formData.get("file") as File | null
  if (!file || file.size === 0) return { ok: false, error: "Selecciona un PDF primero.", ...blank }
  if (!file.name.toLowerCase().endsWith(".pdf")) return { ok: false, error: "El adjunto debe ser un PDF.", ...blank }
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: "El PDF es muy grande (máx. 8MB).", ...blank }

  const buffer = Buffer.from(await file.arrayBuffer())
  const result = await extractInvoiceFields(buffer, { userId: user.id })
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error ?? "No se pudo leer el PDF.", ...blank }
  }

  let matchedContractorId: string | null = null
  if (result.data.contractorIdNumber) {
    const match = await prisma.contractor.findFirst({
      where: { userId: user.id, idNumber: result.data.contractorIdNumber },
    })
    matchedContractorId = match?.id ?? null
  }

  const validDate = result.data.date != null && !isNaN(new Date(result.data.date).getTime())

  return {
    ok: true,
    error: null,
    concept: result.data.concept,
    totalAmount: result.data.totalAmount != null && result.data.totalAmount > 0 ? String(result.data.totalAmount) : null,
    date: validDate ? result.data.date : null,
    retentionRate: result.data.retentionRate,
    bankInfo: result.data.bankInfo,
    contractorName: result.data.contractorName,
    contractorIdNumber: result.data.contractorIdNumber,
    matchedContractorId,
    confidence: result.data.confidence,
    lowConfidence: result.data.confidence < AI_REVIEW_THRESHOLD,
  }
}

export async function updateInvoice(
  id: string,
  data: { contractorId?: string; date?: string; concept?: string; totalAmount?: number; retentionRate?: number | null; bankInfo?: string | null; notes?: string | null }
): Promise<{ error: string | null }> {
  const user = await requireUser()
  const invoice = await prisma.invoice.findFirst({ where: { id, userId: user.id } })
  if (!invoice) return { error: "Cuenta de cobro no encontrada." }

  const updateData: Record<string, unknown> = {}
  if (data.contractorId) {
    const c = await prisma.contractor.findFirst({ where: { id: data.contractorId, userId: user.id } })
    if (!c) return { error: "Contratista no encontrado." }
    updateData.contractorId = data.contractorId
  }
  if (data.date) {
    const d = new Date(data.date)
    if (isNaN(d.getTime())) return { error: "Fecha inválida." }
    updateData.date = d
  }
  if (data.concept !== undefined) {
    if (!data.concept.trim()) return { error: "El concepto no puede estar vacío." }
    updateData.concept = data.concept.trim()
  }
  if (data.totalAmount !== undefined) {
    if (data.totalAmount <= 0) return { error: "El total debe ser mayor a 0." }
    updateData.totalAmount = data.totalAmount
  }
  if ("retentionRate" in data) {
    if (data.retentionRate != null && !VALID_RETENTION_RATES.includes(data.retentionRate)) {
      return { error: "La retención en la fuente solo puede ser 4% o 6%." }
    }
    updateData.retentionRate = data.retentionRate ?? null
  }
  if ("bankInfo" in data) updateData.bankInfo = data.bankInfo?.trim() || null
  if ("notes" in data) updateData.notes = data.notes?.trim() || null

  await prisma.invoice.update({ where: { id }, data: updateData })
  revalidatePath("/invoices")
  revalidatePath("/accounting")
  return { error: null }
}

export async function updateInvoiceNumber(id: string, newNumber: number): Promise<{ error: string | null }> {
  const user = await requireUser()

  if (!Number.isInteger(newNumber) || newNumber < 1) return { error: "El número debe ser un entero positivo." }

  const invoice = await prisma.invoice.findFirst({ where: { id, userId: user.id } })
  if (!invoice) return { error: "Cuenta de cobro no encontrada." }

  const conflict = await prisma.invoice.findFirst({ where: { number: newNumber, userId: user.id, id: { not: id } } })
  if (conflict) return { error: `Ya existe la cuenta de cobro N° ${String(newNumber).padStart(4, "0")}.` }

  await prisma.invoice.update({ where: { id }, data: { number: newNumber } })
  revalidatePath("/invoices")
  return { error: null }
}

export async function getInvoiceLiveData(invoiceId: string): Promise<InvoiceData | null> {
  const session = await auth()
  if (!session?.user?.email) return null
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return null

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId: user.id },
    include: {
      contractor: { select: { name: true, idNumber: true } },
      abonos: {
        select: {
          id: true,
          date: true,
          amount: true,
          accountingRecord: { select: { date: true, expenses: true, expenseVoucher: { select: { number: true } } } },
        },
        orderBy: { date: "asc" },
      },
    },
  })
  if (!invoice) return null

  return toInvoiceData(invoice)
}

export async function generateInvoiceDocument(invoiceId: string): Promise<{ invoice: InvoiceData | null; error: string | null }> {
  const user = await requireUser()

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId: user.id },
    include: {
      contractor: { select: { name: true, idNumber: true } },
      abonos: {
        select: {
          id: true,
          date: true,
          amount: true,
          accountingRecord: { select: { date: true, expenses: true, expenseVoucher: { select: { number: true } } } },
        },
        orderBy: { date: "asc" },
      },
    },
  })
  if (!invoice) return { invoice: null, error: "Cuenta de cobro no encontrada." }

  if (invoice.number != null) return { invoice: toInvoiceData(invoice), error: null }

  const last = await prisma.invoice.findFirst({
    where: { userId: user.id, number: { not: null } },
    orderBy: { number: "desc" },
    select: { number: true },
  })
  const nextNumber = (last?.number ?? 0) + 1

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { number: nextNumber },
    include: {
      contractor: { select: { name: true, idNumber: true } },
      abonos: {
        select: {
          id: true,
          date: true,
          amount: true,
          accountingRecord: { select: { date: true, expenses: true, expenseVoucher: { select: { number: true } } } },
        },
        orderBy: { date: "asc" },
      },
    },
  })

  revalidatePath("/invoices")
  return { invoice: toInvoiceData(updated), error: null }
}

export async function deleteInvoice(id: string): Promise<{ error: string | null }> {
  const user = await requireUser()
  const invoice = await prisma.invoice.findFirst({ where: { id, userId: user.id } })
  if (!invoice) return { error: "Cuenta de cobro no encontrada." }
  if (invoice.fileUrl) await deleteInvoiceFile(invoice.fileUrl).catch(console.error)
  await prisma.invoice.delete({ where: { id: invoice.id } })
  revalidatePath("/invoices")
  return { error: null }
}
