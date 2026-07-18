"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { redirect } from "next/navigation"

export type FinancialAccountData = {
  id: string
  name: string
  type: string
  bankAccountNumber: string | null
}

async function requireUser() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")
  return user
}

export async function listFinancialAccounts(): Promise<FinancialAccountData[]> {
  const session = await auth()
  if (!session?.user?.email) return []
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return []
  const accounts = await prisma.financialAccount.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
  })
  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    bankAccountNumber: a.bankAccountNumber,
  }))
}

export async function createFinancialAccount(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const user = await requireUser()

  const name = (formData.get("name") as string)?.trim()
  if (!name) return { error: "El nombre es requerido." }
  const type = (formData.get("type") as string) === "bank" ? "bank" : "cash"
  const bankAccountNumber = (formData.get("bankAccountNumber") as string)?.trim() || null

  if (bankAccountNumber) {
    const existing = await prisma.financialAccount.findUnique({ where: { bankAccountNumber } })
    if (existing) return { error: "Ya existe una cuenta con ese número." }
  }

  await prisma.financialAccount.create({
    data: { name, type, bankAccountNumber, userId: user.id },
  })

  revalidatePath("/accounts")
  return { error: null }
}

export async function updateFinancialAccount(id: string, field: string, value: string) {
  const user = await requireUser()

  const allowed = ["name", "type", "bankAccountNumber"]
  if (!allowed.includes(field)) return

  const data: Record<string, unknown> = {}
  const trimmed = value.trim()
  switch (field) {
    case "name":
      if (!trimmed) return
      data.name = trimmed
      break
    case "type":
      data.type = trimmed === "bank" ? "bank" : "cash"
      break
    case "bankAccountNumber":
      data.bankAccountNumber = trimmed || null
      break
  }

  await prisma.financialAccount.update({ where: { id, userId: user.id }, data })
  revalidatePath("/accounts")
  revalidatePath("/accounting")
}

export async function deleteFinancialAccount(id: string): Promise<{ error: string | null }> {
  const user = await requireUser()
  await prisma.financialAccount.delete({ where: { id, userId: user.id } })
  revalidatePath("/accounts")
  revalidatePath("/accounting")
  return { error: null }
}
