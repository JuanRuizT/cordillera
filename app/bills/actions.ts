"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import {
  uploadBillDocumentFile,
  deleteBillDocumentFile,
} from "@/lib/bills/gcs"
import { toBillData, type BillData } from "@/lib/bills/document-data"
import { extractBillFields, buildBillNotes, BILL_EXTRACTION_MEDIA_TYPES } from "@/lib/bills/extract"
import { AI_REVIEW_THRESHOLD } from "@/lib/accounting/classify"

const ALLOWED_ATTACHMENT_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"]

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

export async function listBills(): Promise<BillData[]> {
  const session = await auth()
  if (!session?.user?.email) return []
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return []

  const bills = await prisma.bill.findMany({
    where: { userId: user.id },
    orderBy: { date: "asc" },
    include: { accountingRecord: { select: { date: true, expenses: true } } },
  })

  return bills.map(toBillData)
}

export type BillLinkOption = {
  id: string
  concept: string
  date: string
  amount: string
}

// Bills not yet linked to a payment — candidates for LinkBillDialog's dropdown.
export async function listLinkableBills(): Promise<BillLinkOption[]> {
  const session = await auth()
  if (!session?.user?.email) return []
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return []

  const bills = await prisma.bill.findMany({
    where: { userId: user.id, accountingRecordId: null },
    orderBy: { date: "desc" },
  })

  return bills.map((b) => ({
    id: b.id,
    concept: b.concept,
    date: b.date.toISOString(),
    amount: b.amount.toString(),
  }))
}

export type BillExtractionResult = {
  ok: boolean
  error: string | null
  isBill: boolean
  documentKind: string | null
  concept: string | null
  amount: string | null
  date: string | null
  dueDate: string | null
  notes: string | null
  confidence: number
  lowConfidence: boolean
}

// Read-only, same contract as extractInvoiceFromPdf: reads the uploaded file with the LLM and
// returns suggested form values. Does not touch GCS or the DB — the file is uploaded and the Bill
// row created only when the user confirms via createBill.
export async function extractBillFromFile(formData: FormData): Promise<BillExtractionResult> {
  const user = await requireUser()
  const blank = {
    isBill: false, documentKind: null, concept: null, amount: null,
    date: null, dueDate: null, notes: null, confidence: 0, lowConfidence: true,
  }

  const file = formData.get("file") as File | null
  if (!file || file.size === 0) return { ok: false, error: "Selecciona la factura primero.", ...blank }
  const ext = file.name.toLowerCase().split(".").pop() ?? ""
  const mediaType = BILL_EXTRACTION_MEDIA_TYPES[ext]
  if (!mediaType) return { ok: false, error: "La factura debe ser PDF, JPG o PNG.", ...blank }
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: "El archivo es muy grande (máx. 8MB).", ...blank }

  const buffer = Buffer.from(await file.arrayBuffer())
  const result = await extractBillFields(buffer, mediaType, { userId: user.id })
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error ?? "No se pudo leer la factura.", ...blank }
  }

  const d = result.data
  return {
    ok: true,
    error: null,
    isBill: d.isBill,
    documentKind: d.documentKind,
    concept: d.concept,
    amount: d.amount != null ? String(d.amount) : null,
    date: d.issueDate,
    dueDate: d.dueDate,
    notes: d.isBill ? buildBillNotes(d) : null,
    confidence: d.confidence,
    lowConfidence: d.confidence < AI_REVIEW_THRESHOLD,
  }
}

export async function createBill(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const user = await requireUser()

  const concept = (formData.get("concept") as string)?.trim()
  if (!concept) return { error: "El concepto es requerido." }
  const dateStr = formData.get("date") as string
  if (!dateStr) return { error: "La fecha es requerida." }
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return { error: "Fecha inválida." }
  const amount = parseAmount(formData.get("amount"))
  if (amount == null || amount <= 0) return { error: "El monto debe ser mayor a 0." }
  const dueDateStr = (formData.get("dueDate") as string | null)?.trim() || ""
  const dueDate = dueDateStr ? new Date(dueDateStr) : null
  if (dueDate && isNaN(dueDate.getTime())) return { error: "Fecha máxima de pago inválida." }

  let fileName: string | null = null
  let fileUrl: string | null = null
  const file = formData.get("file") as File | null
  if (file && file.size > 0) {
    const ext = file.name.toLowerCase().split(".").pop() ?? ""
    if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext)) {
      return { error: "La factura debe ser PDF, JPG o PNG." }
    }
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      fileUrl = await uploadBillDocumentFile(buffer, file.name, file.type || "application/octet-stream")
      fileName = file.name
    } catch (err) {
      console.error("[createBill] GCS upload error:", err)
      return { error: "No se pudo subir la factura. Intenta de nuevo." }
    }
  }

  await prisma.bill.create({
    data: {
      concept,
      date,
      dueDate,
      amount,
      notes: (formData.get("notes") as string)?.trim() || null,
      fileName,
      fileUrl,
      userId: user.id,
    },
  })

  revalidatePath("/bills")
  return { error: null }
}

export async function updateBill(
  id: string,
  data: { concept?: string; date?: string; dueDate?: string | null; amount?: number; notes?: string | null }
): Promise<{ error: string | null }> {
  const user = await requireUser()
  const bill = await prisma.bill.findFirst({ where: { id, userId: user.id } })
  if (!bill) return { error: "Factura no encontrada." }

  const updateData: Record<string, unknown> = {}
  if (data.concept !== undefined) {
    if (!data.concept.trim()) return { error: "El concepto no puede estar vacío." }
    updateData.concept = data.concept.trim()
  }
  if (data.date) {
    const d = new Date(data.date)
    if (isNaN(d.getTime())) return { error: "Fecha inválida." }
    updateData.date = d
  }
  if (data.amount !== undefined) {
    if (data.amount <= 0) return { error: "El monto debe ser mayor a 0." }
    updateData.amount = data.amount
  }
  if ("notes" in data) updateData.notes = data.notes?.trim() || null
  if ("dueDate" in data) {
    if (!data.dueDate) {
      updateData.dueDate = null
    } else {
      const d = new Date(data.dueDate)
      if (isNaN(d.getTime())) return { error: "Fecha máxima de pago inválida." }
      updateData.dueDate = d
    }
  }

  await prisma.bill.update({ where: { id }, data: updateData })
  revalidatePath("/bills")
  return { error: null }
}

export async function deleteBill(id: string): Promise<{ error: string | null }> {
  const user = await requireUser()
  const bill = await prisma.bill.findFirst({ where: { id, userId: user.id } })
  if (!bill) return { error: "Factura no encontrada." }

  if (bill.fileUrl) await deleteBillDocumentFile(bill.fileUrl).catch(console.error)

  await prisma.bill.delete({ where: { id: bill.id } })
  revalidatePath("/bills")
  return { error: null }
}

export async function uploadBillDocument(
  billId: string,
  formData: FormData
): Promise<{ error: string | null; fileName: string | null; fileUrl: string | null }> {
  const user = await requireUser()
  const bill = await prisma.bill.findFirst({ where: { id: billId, userId: user.id } })
  if (!bill) return { error: "Factura no encontrada", fileName: null, fileUrl: null }

  const file = formData.get("file") as File | null
  if (!file || file.size === 0) return { error: "Selecciona un archivo.", fileName: null, fileUrl: null }

  const ext = file.name.toLowerCase().split(".").pop() ?? ""
  if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext)) {
    return { error: "La factura debe ser PDF, JPG o PNG.", fileName: null, fileUrl: null }
  }

  if (bill.fileUrl) await deleteBillDocumentFile(bill.fileUrl).catch(console.error)

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const fileUrl = await uploadBillDocumentFile(buffer, file.name, file.type || "application/octet-stream")
    await prisma.bill.update({
      where: { id: billId },
      data: { fileName: file.name, fileUrl },
    })
    revalidatePath("/bills")
    return { error: null, fileName: file.name, fileUrl }
  } catch (err) {
    console.error("[uploadBillDocument] GCS upload error:", err)
    return { error: "No se pudo subir la factura. Intenta de nuevo.", fileName: null, fileUrl: null }
  }
}

export async function deleteBillDocument(billId: string): Promise<{ error: string | null }> {
  const user = await requireUser()
  const bill = await prisma.bill.findFirst({ where: { id: billId, userId: user.id } })
  if (!bill) return { error: "Factura no encontrada" }
  if (!bill.fileUrl) return { error: null }

  await deleteBillDocumentFile(bill.fileUrl).catch(console.error)
  await prisma.bill.update({
    where: { id: billId },
    data: { fileName: null, fileUrl: null },
  })
  revalidatePath("/bills")
  return { error: null }
}

// Ligar el pago: soltar cualquier factura previamente ligada a este registro (a lo sumo una,
// por el @unique en accountingRecordId) antes de ligar la nueva — así el <select> del formulario
// siempre puede cambiar la selección sin un paso explícito de "desligar primero".
export async function linkBillPayment(recordId: string, billId: string): Promise<{ error: string | null }> {
  const user = await requireUser()
  const bill = await prisma.bill.findFirst({ where: { id: billId, userId: user.id } })
  if (!bill) return { error: "Factura no encontrada." }

  await prisma.$transaction([
    prisma.bill.updateMany({
      where: { accountingRecordId: recordId, userId: user.id },
      data: { accountingRecordId: null },
    }),
    prisma.bill.update({
      where: { id: billId },
      data: { accountingRecordId: recordId },
    }),
  ])

  revalidatePath("/bills")
  revalidatePath("/accounting")
  return { error: null }
}

export async function unlinkBillPayment(recordId: string): Promise<{ error: string | null }> {
  const user = await requireUser()
  // updateMany (not update) — harmless no-op if the record is already unlinked.
  await prisma.bill.updateMany({
    where: { accountingRecordId: recordId, userId: user.id },
    data: { accountingRecordId: null },
  })
  revalidatePath("/bills")
  revalidatePath("/accounting")
  return { error: null }
}
