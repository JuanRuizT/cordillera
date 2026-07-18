"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { numberToWords } from "@/lib/number-to-words"
import { getSignatureDataUrl } from "@/lib/signature"
import { derivePaymentMethod } from "@/lib/payment-method"
import { classifyMovements } from "@/lib/accounting/classify"
import { uploadPaymentProofFile, deletePaymentProofFile, uploadFacturaFile, deleteFacturaFile } from "@/lib/accounting/gcs"

// Shared by payment-proof and factura attachments.
const ALLOWED_ATTACHMENT_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"]

export type CashReceiptData = {
  id: string
  number: number
  accountingRecordId: string
  isIncome: boolean
  recipientName: string
  unit: string
  date: string
  concept: string
  amount: string
  amountInWords: string
  paymentMethod: string
  // How many CashReceipt rows share this same accountingRecordId (>= 1). When > 1 the
  // payment has been split — amount/concept are per-receipt overrides, not live-derived.
  siblingCount: number
}

export type ExpenseVoucherData = {
  id: string
  number: number
  accountingRecordId: string
  contractorId: string | null
  contractorName: string
  contractorIdNumber: string
  date: string
  concept: string
  amount: string
  accountId: string | null
  paymentMethod: string
}

function parseOptionalDecimal(val: FormDataEntryValue | null): number | null {
  if (!val || String(val).trim() === "") return null
  const n = parseFloat(String(val).replace(/,/g, ""))
  return isNaN(n) ? null : n
}

export async function createAccountingRecord(
  _prevState: { error: string | null },
  formData: FormData
) {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")

  const concept = (formData.get("concept") as string)?.trim()
  if (!concept) return { error: "El concepto es requerido." }

  const dateStr = formData.get("date") as string
  if (!dateStr) return { error: "La fecha es requerida." }
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return { error: "Fecha inválida." }

  const category = (formData.get("category") as string) || null
  const property = (formData.get("property") as string) || null

  await prisma.accountingRecord.create({
    data: {
      concept,
      date,
      income: parseOptionalDecimal(formData.get("income")),
      expenses: parseOptionalDecimal(formData.get("expenses")),
      category,
      property,
      // Typed by hand in the new-record form — never up for grabs by a future reclassify.
      conceptConfirmed: true,
      categoryConfirmed: category != null,
      propertyConfirmed: property != null,
      expenseVoucherGenerated: formData.get("expenseVoucherGenerated") === "on",
      accountId: (formData.get("accountId") as string) || null,
      userId: user.id,
    },
  })

  revalidatePath("/accounting")
  return { error: null }
}

export async function updateAccountingRecord(id: string, field: string, value: string) {
  const session = await auth()
  if (!session?.user?.email) return
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return

  const allowed = ["concept", "date", "income", "expenses", "category", "property", "cashReceiptGenerated", "expenseVoucherGenerated", "accountId"]
  if (!allowed.includes(field)) return

  const data: Record<string, unknown> = {}

  switch (field) {
    case "concept":
      if (!value.trim()) return
      data.concept = value.trim()
      data.conceptConfirmed = true
      data.categorySource = "manual"
      data.categoryConfidence = null
      break
    case "date": {
      const d = new Date(value)
      if (isNaN(d.getTime())) return
      data.date = d
      break
    }
    case "income":
    case "expenses": {
      const n = value === "" ? null : parseFloat(value)
      if (value !== "" && isNaN(n!)) return
      data[field] = n
      break
    }
    case "category":
      data.category = value.trim() || null
      data.categoryConfirmed = true
      data.categorySource = "manual"
      data.categoryConfidence = null
      break
    case "property":
      data.property = value.trim() || null
      data.propertyConfirmed = true
      data.categorySource = "manual"
      data.categoryConfidence = null
      break
    case "accountId":
      data[field] = value.trim() || null
      break
    case "cashReceiptGenerated":
    case "expenseVoucherGenerated":
      data[field] = value === "true"
      break
  }

  await prisma.accountingRecord.update({
    where: { id, userId: user.id },
    data,
  })

  revalidatePath("/accounting")
}

export async function reclassifyRecord(id: string): Promise<{ error: string | null }> {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")

  const record = await prisma.accountingRecord.findUnique({
    where: { id, userId: user.id },
    include: { bankMovement: true, abono: { include: { invoice: { include: { contractor: true } } } } },
  })
  if (!record) return { error: "Registro no encontrado." }

  if (record.abono) {
    await prisma.accountingRecord.update({
      where: { id },
      data: {
        concept: `${record.abono.invoice.contractor.name} — ${record.abono.invoice.concept}`,
        categorySource: "manual",
        categoryConfidence: null,
      },
    })
    revalidatePath("/accounting")
    return { error: null }
  }

  const amount = record.income != null ? Number(record.income) : -Number(record.expenses ?? 0)
  const description = record.bankMovement?.description ?? record.concept

  const classification = await classifyMovements(
    [{
      bankMovementId: record.id,
      description,
      date: record.date,
      amount,
      currentConcept: record.concept,
      currentCategory: record.category,
      currentProperty: record.property,
    }],
    { userId: user.id, bankStatementId: record.bankStatementId ?? undefined }
  )

  const guess = classification.items.get(record.id)
  if (!classification.ok || !guess) {
    return { error: classification.error ?? "La IA no pudo reclasificar este registro." }
  }

  // Per field: once a human has confirmed it, the AI never touches it again. Until then, take
  // the AI's fresh proposal — but if it doesn't have one this round, keep whatever was there
  // rather than blanking it out.
  const finalConcept = record.conceptConfirmed ? record.concept : (guess.concept?.trim() || record.concept)
  const finalCategory = record.categoryConfirmed ? record.category : (guess.category ?? record.category)
  const finalProperty = record.propertyConfirmed ? record.property : (guess.property ?? record.property)

  // categorySource/categoryConfidence are a single row-level "needs review" signal (used by the
  // amber highlight): true whenever category or property is still the AI's call this round.
  const aiStillOwnsSomething = !record.categoryConfirmed || !record.propertyConfirmed

  await prisma.accountingRecord.update({
    where: { id },
    data: {
      concept: finalConcept,
      category: finalCategory,
      property: finalProperty,
      categorySource: aiStillOwnsSomething ? "ai" : record.categorySource,
      categoryConfidence: aiStillOwnsSomething ? guess.confidence : record.categoryConfidence,
    },
  })

  revalidatePath("/accounting")
  return { error: null }
}

function buildReceiptData(
  cr: { id: string; number: number; amount: { toString(): string } | null; concept: string | null },
  siblingCount: number,
  record: { id: string; date: Date; concept: string; income: { toString(): string } | null; expenses: { toString(): string } | null; property: string | null; account: { type: string } | null },
  recipientName: string
): CashReceiptData {
  const rawAmount = cr.amount ?? record.income ?? record.expenses ?? 0
  const concept = cr.concept ?? record.concept
  return {
    id: cr.id,
    number: cr.number,
    accountingRecordId: record.id,
    isIncome: record.income != null,
    paymentMethod: derivePaymentMethod(record.account?.type ?? null),
    date: record.date.toISOString(),
    concept,
    amount: rawAmount.toString(),
    recipientName,
    unit: record.property ?? "",
    amountInWords: numberToWords(Number(rawAmount)),
    siblingCount,
  }
}

export async function generateCashReceipt(
  accountingRecordId: string
): Promise<{ receipt: CashReceiptData | null; error: string | null }> {
  const session = await auth()
  if (!session?.user?.email) return { receipt: null, error: "No autorizado" }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return { receipt: null, error: "No autorizado" }

  const record = await prisma.accountingRecord.findUnique({
    where: { id: accountingRecordId, userId: user.id },
    include: { cashReceipts: { orderBy: { number: "asc" } }, account: true },
  })
  if (!record) return { receipt: null, error: "Registro no encontrado" }

  let recipientName = ""
  if (record.property) {
    const owner = await prisma.owner.findFirst({ where: { unit: record.property } })
    recipientName = owner?.name ?? ""
  }

  if (record.cashReceipts.length > 0) {
    const first = record.cashReceipts[0]
    return { receipt: buildReceiptData(first, record.cashReceipts.length, record, recipientName), error: null }
  }

  const lastReceipt = await prisma.cashReceipt.findFirst({
    orderBy: { number: "desc" },
    select: { number: true },
  })
  const nextNumber = (lastReceipt?.number ?? 0) + 1

  const created = await prisma.cashReceipt.create({
    data: { number: nextNumber, accountingRecordId, userId: user.id },
  })

  await prisma.accountingRecord.update({
    where: { id: accountingRecordId },
    data: { cashReceiptGenerated: true },
  })

  revalidatePath("/accounting")

  return { receipt: buildReceiptData(created, 1, record, recipientName), error: null }
}

// Kept in sync with CASH_RECEIPT_CATEGORIES in table.tsx.
const CASH_RECEIPT_CATEGORIES = new Set(["Pago Administración", "Cuota extraordinaria"])

export async function generateCashReceiptsBulk(
  accountingRecordIds: string[]
): Promise<{ generated: number; skipped: number; error: string | null }> {
  const session = await auth()
  if (!session?.user?.email) return { generated: 0, skipped: 0, error: "No autorizado" }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return { generated: 0, skipped: 0, error: "No autorizado" }

  const records = await prisma.accountingRecord.findMany({
    where: { id: { in: accountingRecordIds }, userId: user.id },
    include: { cashReceipts: true },
  })
  const byId = new Map(records.map((r) => [r.id, r]))

  // Preserve the order the ids were passed in (mirrors table row order) so the
  // consecutive numbering matches what the user sees on screen.
  const ordered = accountingRecordIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r)
  const toGenerate = ordered.filter((r) => CASH_RECEIPT_CATEGORIES.has(r.category ?? "") && r.cashReceipts.length === 0)
  const skipped = ordered.length - toGenerate.length

  if (toGenerate.length === 0) return { generated: 0, skipped, error: null }

  const lastReceipt = await prisma.cashReceipt.findFirst({
    orderBy: { number: "desc" },
    select: { number: true },
  })
  let nextNumber = (lastReceipt?.number ?? 0) + 1

  await prisma.$transaction([
    ...toGenerate.map((r) =>
      prisma.cashReceipt.create({
        data: { number: nextNumber++, accountingRecordId: r.id, userId: user.id },
      })
    ),
    prisma.accountingRecord.updateMany({
      where: { id: { in: toGenerate.map((r) => r.id) } },
      data: { cashReceiptGenerated: true },
    }),
  ])

  revalidatePath("/accounting")

  return { generated: toGenerate.length, skipped, error: null }
}

export async function getCashReceiptLiveData(cashReceiptId: string): Promise<CashReceiptData | null> {
  const session = await auth()
  if (!session?.user?.email) return null
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return null

  const cr = await prisma.cashReceipt.findUnique({
    where: { id: cashReceiptId, userId: user.id },
    include: { accountingRecord: { include: { account: true, cashReceipts: true } } },
  })
  if (!cr) return null

  const record = cr.accountingRecord
  let recipientName = ""
  if (record.property) {
    const owner = await prisma.owner.findFirst({ where: { unit: record.property } })
    recipientName = owner?.name ?? ""
  }

  return buildReceiptData(cr, record.cashReceipts.length, record, recipientName)
}

export async function listCashReceipts(
  accountingRecordId: string
): Promise<{ receipts: CashReceiptData[]; recordAmount: string; recordConcept: string; error: string | null }> {
  const session = await auth()
  if (!session?.user?.email) return { receipts: [], recordAmount: "0", recordConcept: "", error: "No autorizado" }
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return { receipts: [], recordAmount: "0", recordConcept: "", error: "No autorizado" }

  const record = await prisma.accountingRecord.findUnique({
    where: { id: accountingRecordId, userId: user.id },
    include: { cashReceipts: { orderBy: { number: "asc" } }, account: true },
  })
  if (!record) return { receipts: [], recordAmount: "0", recordConcept: "", error: "Registro no encontrado" }

  let recipientName = ""
  if (record.property) {
    const owner = await prisma.owner.findFirst({ where: { unit: record.property } })
    recipientName = owner?.name ?? ""
  }

  const siblingCount = record.cashReceipts.length
  const receipts = record.cashReceipts.map((cr) => buildReceiptData(cr, siblingCount, record, recipientName))
  const recordAmount = (record.income ?? record.expenses ?? 0).toString()

  return { receipts, recordAmount, recordConcept: record.concept, error: null }
}

export async function addCashReceipt(
  accountingRecordId: string,
  amount: string,
  concept: string
): Promise<{ receipt: CashReceiptData | null; error: string | null }> {
  const session = await auth()
  if (!session?.user?.email) return { receipt: null, error: "No autorizado" }
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return { receipt: null, error: "No autorizado" }

  const parsedAmount = parseFloat(amount)
  if (isNaN(parsedAmount) || parsedAmount <= 0) return { receipt: null, error: "El monto debe ser mayor a cero." }
  const trimmedConcept = concept.trim()
  if (!trimmedConcept) return { receipt: null, error: "El concepto es requerido." }

  const record = await prisma.accountingRecord.findUnique({
    where: { id: accountingRecordId, userId: user.id },
    include: { cashReceipts: { orderBy: { number: "asc" } }, account: true },
  })
  if (!record) return { receipt: null, error: "Registro no encontrado" }

  // If splitting off the very first sibling, freeze its current live-derived amount/concept as
  // its own override first — otherwise it would keep tracking the full record amount forever,
  // double-counting alongside whatever we're about to carve out into the new receipt.
  const [first] = record.cashReceipts
  if (record.cashReceipts.length === 1 && first.amount == null) {
    await prisma.cashReceipt.update({
      where: { id: first.id },
      data: {
        amount: record.income ?? record.expenses ?? 0,
        concept: record.concept,
      },
    })
  }

  const lastReceipt = await prisma.cashReceipt.findFirst({
    orderBy: { number: "desc" },
    select: { number: true },
  })
  const nextNumber = (lastReceipt?.number ?? 0) + 1

  const created = await prisma.cashReceipt.create({
    data: { number: nextNumber, accountingRecordId, userId: user.id, amount: parsedAmount, concept: trimmedConcept },
  })

  let recipientName = ""
  if (record.property) {
    const owner = await prisma.owner.findFirst({ where: { unit: record.property } })
    recipientName = owner?.name ?? ""
  }

  revalidatePath("/accounting")

  return { receipt: buildReceiptData(created, record.cashReceipts.length + 1, record, recipientName), error: null }
}

export async function updateCashReceiptNumber(
  cashReceiptId: string,
  newNumber: number
): Promise<{ error: string | null }> {
  const session = await auth()
  if (!session?.user?.email) return { error: "No autorizado" }
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return { error: "No autorizado" }

  if (!Number.isInteger(newNumber) || newNumber < 1) return { error: "El número debe ser un entero positivo." }

  const conflict = await prisma.cashReceipt.findFirst({ where: { number: newNumber, id: { not: cashReceiptId } } })
  if (conflict) return { error: `Ya existe el recibo N° ${String(newNumber).padStart(4, "0")}.` }

  await prisma.cashReceipt.update({ where: { id: cashReceiptId, userId: user.id }, data: { number: newNumber } })
  revalidatePath("/accounting")
  return { error: null }
}

export async function updateCashReceiptAmount(cashReceiptId: string, amount: string): Promise<{ error: string | null }> {
  const session = await auth()
  if (!session?.user?.email) return { error: "No autorizado" }
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return { error: "No autorizado" }

  const parsedAmount = parseFloat(amount)
  if (isNaN(parsedAmount) || parsedAmount <= 0) return { error: "El monto debe ser mayor a cero." }

  await prisma.cashReceipt.update({ where: { id: cashReceiptId, userId: user.id }, data: { amount: parsedAmount } })
  revalidatePath("/accounting")
  return { error: null }
}

export async function updateCashReceiptConcept(cashReceiptId: string, concept: string): Promise<{ error: string | null }> {
  const session = await auth()
  if (!session?.user?.email) return { error: "No autorizado" }
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return { error: "No autorizado" }

  const trimmed = concept.trim()
  if (!trimmed) return { error: "El concepto es requerido." }

  await prisma.cashReceipt.update({ where: { id: cashReceiptId, userId: user.id }, data: { concept: trimmed } })
  revalidatePath("/accounting")
  return { error: null }
}

export async function deleteCashReceipt(cashReceiptId: string): Promise<{ error: string | null }> {
  const session = await auth()
  if (!session?.user?.email) return { error: "No autorizado" }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return { error: "No autorizado" }

  const existing = await prisma.cashReceipt.findUnique({
    where: { id: cashReceiptId, userId: user.id },
  })
  if (!existing) return { error: "Recibo no encontrado" }

  await prisma.$transaction(async (tx) => {
    await tx.cashReceipt.delete({ where: { id: existing.id } })

    const remaining = await tx.cashReceipt.findMany({
      where: { accountingRecordId: existing.accountingRecordId },
    })

    // Un-splitting back down to a single receipt: drop its overrides so it goes back to plain
    // live derivation from the record, exactly like a payment that was never split.
    if (remaining.length === 1 && remaining[0].amount != null) {
      await tx.cashReceipt.update({
        where: { id: remaining[0].id },
        data: { amount: null, concept: null },
      })
    }

    await tx.accountingRecord.update({
      where: { id: existing.accountingRecordId },
      data: { cashReceiptGenerated: remaining.length > 0 },
    })
  })

  revalidatePath("/accounting")
  return { error: null }
}

export async function deleteCashReceiptsBulk(cashReceiptIds: string[]): Promise<{ deleted: number; error: string | null }> {
  const session = await auth()
  if (!session?.user?.email) return { deleted: 0, error: "No autorizado" }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return { deleted: 0, error: "No autorizado" }

  const existing = await prisma.cashReceipt.findMany({
    where: { id: { in: cashReceiptIds }, userId: user.id },
    select: { id: true, accountingRecordId: true },
  })
  if (existing.length === 0) return { deleted: 0, error: null }

  const affectedRecordIds = [...new Set(existing.map((e) => e.accountingRecordId))]

  await prisma.$transaction(async (tx) => {
    await tx.cashReceipt.deleteMany({ where: { id: { in: existing.map((e) => e.id) } } })
    const stillHaveReceipts = new Set(
      (await tx.cashReceipt.findMany({
        where: { accountingRecordId: { in: affectedRecordIds } },
        select: { accountingRecordId: true },
      })).map((r) => r.accountingRecordId)
    )
    for (const id of affectedRecordIds) {
      await tx.accountingRecord.update({
        where: { id },
        data: { cashReceiptGenerated: stillHaveReceipts.has(id) },
      })
    }
  })

  revalidatePath("/accounting")
  return { deleted: existing.length, error: null }
}

export async function getAdminSignatureDataUrl(): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.email) return null
  return getSignatureDataUrl()
}

// ---- Comprobante de Egreso (Expense Voucher) ----

function buildVoucherData(
  v: { id: string; number: number; contractorId: string | null },
  record: { id: string; date: Date; concept: string; income: { toString(): string } | null; expenses: { toString(): string } | null; accountId: string | null; account: { type: string } | null },
  contractor: { name: string; idNumber: string } | null
): ExpenseVoucherData {
  const rawAmount = record.expenses ?? record.income ?? 0

  return {
    id: v.id,
    number: v.number,
    accountingRecordId: record.id,
    contractorId: v.contractorId,
    contractorName: contractor?.name ?? "Contratista eliminado",
    contractorIdNumber: contractor?.idNumber ?? "—",
    date: record.date.toISOString(),
    concept: record.concept,
    amount: rawAmount.toString(),
    accountId: record.accountId,
    paymentMethod: derivePaymentMethod(record.account?.type ?? null),
  }
}

export async function generateExpenseVoucher(
  accountingRecordId: string,
  contractorId?: string | null,
  invoiceId?: string | null
): Promise<{ voucher: ExpenseVoucherData | null; error: string | null }> {
  const session = await auth()
  if (!session?.user?.email) return { voucher: null, error: "No autorizado" }
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return { voucher: null, error: "No autorizado" }

  const record = await prisma.accountingRecord.findUnique({
    where: { id: accountingRecordId, userId: user.id },
    include: { expenseVoucher: true, abono: { include: { invoice: { include: { contractor: true } } } }, account: true },
  })
  if (!record) return { voucher: null, error: "Registro no encontrado" }
  if (record.expenseVoucher) {
    const existingContractor = record.abono?.invoice.contractor
      ?? (record.expenseVoucher.contractorId
        ? await prisma.contractor.findUnique({ where: { id: record.expenseVoucher.contractorId } })
        : null)
    return { voucher: buildVoucherData(record.expenseVoucher, record, existingContractor), error: null }
  }

  // Resolve the invoice link: an explicitly passed one (validate + set on the record) or the record's existing link.
  let effectiveInvoiceId = record.abono?.invoiceId ?? null
  let invoiceContractor = record.abono?.invoice.contractor ?? null
  if (invoiceId && invoiceId !== effectiveInvoiceId) {
    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, userId: user.id }, include: { contractor: true } })
    if (invoice) {
      effectiveInvoiceId = invoice.id
      invoiceContractor = invoice.contractor
    }
  }

  // Contractor: inherited from the linked invoice, otherwise the explicit selection (egreso suelto).
  let contractor = invoiceContractor
  if (!contractor) {
    if (!contractorId) return { voucher: null, error: "Selecciona un contratista o una cuenta de cobro." }
    contractor = await prisma.contractor.findUnique({ where: { id: contractorId, userId: user.id } })
    if (!contractor) return { voucher: null, error: "Contratista no encontrado" }
  }

  const last = await prisma.expenseVoucher.findFirst({ orderBy: { number: "desc" }, select: { number: true } })
  const nextNumber = (last?.number ?? 0) + 1

  const created = await prisma.expenseVoucher.create({
    data: {
      number: nextNumber,
      accountingRecordId,
      contractorId: contractor.id,
      userId: user.id,
    },
  })

  const updatedRecord = await prisma.accountingRecord.update({
    where: { id: accountingRecordId },
    data: { expenseVoucherGenerated: true },
    include: { account: true },
  })

  if (effectiveInvoiceId) {
    await prisma.abono.upsert({
      where: { accountingRecordId },
      create: { invoiceId: effectiveInvoiceId, accountingRecordId, userId: user.id },
      update: { invoiceId: effectiveInvoiceId },
    })
  }

  revalidatePath("/accounting")
  revalidatePath("/invoices")
  return { voucher: buildVoucherData(created, updatedRecord, contractor), error: null }
}

export async function getExpenseVoucherLiveData(expenseVoucherId: string): Promise<ExpenseVoucherData | null> {
  const session = await auth()
  if (!session?.user?.email) return null
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return null

  const v = await prisma.expenseVoucher.findUnique({
    where: { id: expenseVoucherId, userId: user.id },
    include: { accountingRecord: { include: { account: true } }, contractor: true },
  })
  if (!v || !v.accountingRecord) return null

  return buildVoucherData(v, v.accountingRecord, v.contractor)
}

export async function updateExpenseVoucherNumber(
  expenseVoucherId: string,
  newNumber: number
): Promise<{ error: string | null }> {
  const session = await auth()
  if (!session?.user?.email) return { error: "No autorizado" }
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return { error: "No autorizado" }

  if (!Number.isInteger(newNumber) || newNumber < 1) return { error: "El número debe ser un entero positivo." }

  const conflict = await prisma.expenseVoucher.findFirst({ where: { number: newNumber, id: { not: expenseVoucherId } } })
  if (conflict) return { error: `Ya existe el comprobante N° ${String(newNumber).padStart(4, "0")}.` }

  await prisma.expenseVoucher.update({ where: { id: expenseVoucherId, userId: user.id }, data: { number: newNumber } })
  revalidatePath("/accounting")
  return { error: null }
}

export async function updateExpenseVoucherContractor(
  expenseVoucherId: string,
  contractorId: string
): Promise<{ voucher: ExpenseVoucherData | null; error: string | null }> {
  const session = await auth()
  if (!session?.user?.email) return { voucher: null, error: "No autorizado" }
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return { voucher: null, error: "No autorizado" }

  const contractor = await prisma.contractor.findUnique({ where: { id: contractorId, userId: user.id } })
  if (!contractor) return { voucher: null, error: "Contratista no encontrado" }

  const v = await prisma.expenseVoucher.update({
    where: { id: expenseVoucherId, userId: user.id },
    data: { contractorId },
    include: { accountingRecord: { include: { account: true } } },
  })
  if (!v.accountingRecord) return { voucher: null, error: "Registro contable no encontrado" }

  revalidatePath("/accounting")
  return { voucher: buildVoucherData(v, v.accountingRecord, contractor), error: null }
}

export async function deleteExpenseVoucher(expenseVoucherId: string): Promise<{ error: string | null }> {
  const session = await auth()
  if (!session?.user?.email) return { error: "No autorizado" }
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return { error: "No autorizado" }

  const existing = await prisma.expenseVoucher.findUnique({ where: { id: expenseVoucherId, userId: user.id } })
  if (!existing) return { error: "Comprobante no encontrado" }

  await prisma.expenseVoucher.delete({ where: { id: existing.id } })
  await prisma.accountingRecord.update({
    where: { id: existing.accountingRecordId },
    data: { expenseVoucherGenerated: false },
  })

  revalidatePath("/accounting")
  revalidatePath("/invoices")
  return { error: null }
}

// ---- Comprobante de Pago (payment proof upload) ----

export async function uploadPaymentProof(
  accountingRecordId: string,
  formData: FormData
): Promise<{ error: string | null; fileName: string | null; fileUrl: string | null }> {
  const session = await auth()
  if (!session?.user?.email) return { error: "No autorizado", fileName: null, fileUrl: null }
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return { error: "No autorizado", fileName: null, fileUrl: null }

  const record = await prisma.accountingRecord.findUnique({ where: { id: accountingRecordId, userId: user.id } })
  if (!record) return { error: "Registro no encontrado", fileName: null, fileUrl: null }

  const file = formData.get("file") as File | null
  if (!file || file.size === 0) return { error: "Selecciona un archivo.", fileName: null, fileUrl: null }

  const ext = file.name.toLowerCase().split(".").pop() ?? ""
  if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext)) {
    return { error: "El comprobante debe ser PDF, JPG o PNG.", fileName: null, fileUrl: null }
  }

  if (record.paymentProofFileUrl) await deletePaymentProofFile(record.paymentProofFileUrl).catch(console.error)

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const fileUrl = await uploadPaymentProofFile(buffer, file.name, file.type || "application/octet-stream")
    await prisma.accountingRecord.update({
      where: { id: accountingRecordId },
      data: { paymentProofFileName: file.name, paymentProofFileUrl: fileUrl },
    })
    revalidatePath("/accounting")
    return { error: null, fileName: file.name, fileUrl }
  } catch (err) {
    console.error("[uploadPaymentProof] GCS upload error:", err)
    return { error: "No se pudo subir el comprobante. Intenta de nuevo.", fileName: null, fileUrl: null }
  }
}

export async function deletePaymentProof(accountingRecordId: string): Promise<{ error: string | null }> {
  const session = await auth()
  if (!session?.user?.email) return { error: "No autorizado" }
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return { error: "No autorizado" }

  const record = await prisma.accountingRecord.findUnique({ where: { id: accountingRecordId, userId: user.id } })
  if (!record) return { error: "Registro no encontrado" }
  if (!record.paymentProofFileUrl) return { error: null }

  await deletePaymentProofFile(record.paymentProofFileUrl).catch(console.error)
  await prisma.accountingRecord.update({
    where: { id: accountingRecordId },
    data: { paymentProofFileName: null, paymentProofFileUrl: null },
  })
  revalidatePath("/accounting")
  return { error: null }
}

export async function uploadFactura(
  accountingRecordId: string,
  formData: FormData
): Promise<{ error: string | null; fileName: string | null; fileUrl: string | null }> {
  const session = await auth()
  if (!session?.user?.email) return { error: "No autorizado", fileName: null, fileUrl: null }
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return { error: "No autorizado", fileName: null, fileUrl: null }

  const record = await prisma.accountingRecord.findUnique({ where: { id: accountingRecordId, userId: user.id } })
  if (!record) return { error: "Registro no encontrado", fileName: null, fileUrl: null }

  const file = formData.get("file") as File | null
  if (!file || file.size === 0) return { error: "Selecciona un archivo.", fileName: null, fileUrl: null }

  const ext = file.name.toLowerCase().split(".").pop() ?? ""
  if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext)) {
    return { error: "La factura debe ser PDF, JPG o PNG.", fileName: null, fileUrl: null }
  }

  if (record.facturaFileUrl) await deleteFacturaFile(record.facturaFileUrl).catch(console.error)

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const fileUrl = await uploadFacturaFile(buffer, file.name, file.type || "application/octet-stream")
    await prisma.accountingRecord.update({
      where: { id: accountingRecordId },
      data: { facturaFileName: file.name, facturaFileUrl: fileUrl },
    })
    revalidatePath("/accounting")
    return { error: null, fileName: file.name, fileUrl }
  } catch (err) {
    console.error("[uploadFactura] GCS upload error:", err)
    return { error: "No se pudo subir la factura. Intenta de nuevo.", fileName: null, fileUrl: null }
  }
}

export async function deleteFactura(accountingRecordId: string): Promise<{ error: string | null }> {
  const session = await auth()
  if (!session?.user?.email) return { error: "No autorizado" }
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return { error: "No autorizado" }

  const record = await prisma.accountingRecord.findUnique({ where: { id: accountingRecordId, userId: user.id } })
  if (!record) return { error: "Registro no encontrado" }
  if (!record.facturaFileUrl) return { error: null }

  await deleteFacturaFile(record.facturaFileUrl).catch(console.error)
  await prisma.accountingRecord.update({
    where: { id: accountingRecordId },
    data: { facturaFileName: null, facturaFileUrl: null },
  })
  revalidatePath("/accounting")
  return { error: null }
}

export async function deleteAccountingRecords(ids: string[]) {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")

  await prisma.accountingRecord.deleteMany({
    where: { id: { in: ids }, userId: user.id },
  })

  revalidatePath("/accounting")
}
