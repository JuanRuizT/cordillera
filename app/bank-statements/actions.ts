"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { parseBankStatement } from "@/lib/bank-statements/parse-excel"
import { uploadStatementFile, downloadStatementBuffer, deleteStatementFile } from "@/lib/bank-statements/gcs"
import { classifyMovements } from "@/lib/accounting/classify"

export async function uploadStatement(_prevState: { error: string | null }, formData: FormData) {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")

  const file = formData.get("file") as File | null
  if (!file || file.size === 0) return { error: "Selecciona un archivo Excel." }

  const allowedExtensions = [".xlsx", ".xlsm", ".xls"]
  if (!allowedExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))) {
    return { error: "Solo se aceptan archivos Excel (.xlsx, .xlsm)." }
  }

  const existing = await prisma.bankStatement.findFirst({
    where: { userId: user.id, fileName: file.name },
  })
  if (existing) return { error: `El archivo "${file.name}" ya fue subido anteriormente.` }

  const buffer = Buffer.from(await file.arrayBuffer())

  let fileUrl: string | null = null
  try {
    fileUrl = await uploadStatementFile(buffer, file.name)
  } catch (err) {
    console.error("[uploadStatement] GCS upload error:", err)
    return { error: "No se pudo subir el archivo. Intenta de nuevo." }
  }

  await prisma.bankStatement.create({
    data: { fileName: file.name, fileUrl, userId: user.id },
  })

  revalidatePath("/bank-statements")
  return { error: null }
}

export async function processStatement(id: string): Promise<{ error: string | null }> {
  const statement = await prisma.bankStatement.findUnique({ where: { id } })
  if (!statement?.fileUrl) return { error: "El extracto no tiene archivo para procesar." }

  const buffer = await downloadStatementBuffer(statement.fileUrl)
  const data = parseBankStatement(buffer)

  await prisma.$transaction(async (tx) => {
    await tx.bankStatement.update({
      where: { id },
      data: {
        client: data.client,
        address: data.address,
        city: data.city,
        accountType: data.accountType,
        accountNumber: data.accountNumber,
        branch: data.branch,
        startDate: data.startDate,
        endDate: data.endDate,
        previousBalance: data.previousBalance,
        totalCredits: data.totalCredits,
        totalDebits: data.totalDebits,
        currentBalance: data.currentBalance,
        averageBalance: data.averageBalance,
        interest: data.interest,
        taxWithholding: data.taxWithholding,
      },
    })

    await tx.bankMovement.deleteMany({ where: { bankStatementId: id } })
    await tx.bankMovement.createMany({
      data: data.movements.map((m) => ({
        bankStatementId: id,
        date: m.date,
        description: m.description,
        branch: m.branch,
        document: m.document,
        amount: m.amount,
        balance: m.balance,
      })),
    })
  })

  revalidatePath("/bank-statements")
  return { error: null }
}

export async function moveToAccounting(
  bankStatementId: string
): Promise<{ error: string | null; moved: number }> {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")

  const statement = await prisma.bankStatement.findUnique({
    where: { id: bankStatementId, userId: user.id },
    include: { movements: true },
  })

  if (!statement) return { error: "Extracto no encontrado", moved: 0 }

  const alreadySynced = new Set(
    (await prisma.accountingRecord.findMany({
      where: { bankMovementId: { in: statement.movements.map((m) => m.id) } },
      select: { bankMovementId: true },
    })).map((r) => r.bankMovementId)
  )

  const pending = statement.movements.filter((m) => !alreadySynced.has(m.id))
  if (pending.length === 0) return { error: null, moved: 0 }

  // Resolve (or auto-create) the FinancialAccount this statement's account number maps to.
  const account = statement.accountNumber
    ? await prisma.financialAccount.upsert({
        where: { bankAccountNumber: statement.accountNumber },
        create: {
          name: statement.accountType ? `${statement.accountType} ${statement.accountNumber}` : statement.accountNumber,
          type: "bank",
          bankAccountNumber: statement.accountNumber,
          userId: user.id,
        },
        update: {},
      })
    : (await prisma.financialAccount.findFirst({ where: { userId: user.id, name: statement.client ?? "Banco" } }))
      ?? (await prisma.financialAccount.create({
        data: { name: statement.client ?? "Banco", type: "bank", userId: user.id },
      }))

  // Classify before opening the DB transaction — this is a network call to an external LLM
  // and must never hold a Postgres transaction open while waiting on it.
  const classification = await classifyMovements(
    pending.map((m) => ({ bankMovementId: m.id, description: m.description, date: m.date, amount: Number(m.amount) })),
    { userId: user.id, bankStatementId }
  )

  await prisma.$transaction(async (tx) => {
    for (const m of pending) {
      const amount = Number(m.amount)
      const guess = classification.items.get(m.id)

      await tx.accountingRecord.create({
        data: {
          concept: guess?.concept?.trim() || m.description,
          date: m.date,
          income: amount > 0 ? m.amount : null,
          expenses: amount < 0 ? Math.abs(amount) : null,
          category: guess?.category ?? null,
          property: guess?.property ?? null,
          categorySource: guess ? "ai" : "manual",
          categoryConfidence: guess?.confidence ?? null,
          bankStatementId,
          bankMovementId: m.id,
          accountId: account.id,
          userId: user.id,
        },
      })
    }
  })

  revalidatePath("/bank-statements", "layout")
  revalidatePath("/accounting")
  return { error: null, moved: pending.length }
}

export async function deleteStatement(id: string): Promise<{ error: string | null }> {
  const statement = await prisma.bankStatement.findUnique({ where: { id } })
  if (!statement) return { error: "Extracto no encontrado" }
  if (statement.fileUrl) {
    await deleteStatementFile(statement.fileUrl).catch(console.error)
  }
  await prisma.bankStatement.delete({ where: { id } })
  revalidatePath("/bank-statements")
  return { error: null }
}
