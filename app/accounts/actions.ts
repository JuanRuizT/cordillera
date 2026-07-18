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

export type FinancialAccountWithBalance = FinancialAccountData & { balance: string }

export async function listFinancialAccountsWithBalance(): Promise<{
  accounts: FinancialAccountWithBalance[]
  unassignedBalance: string
  totalBalance: string
}> {
  const empty = { accounts: [], unassignedBalance: "0", totalBalance: "0" }
  const session = await auth()
  if (!session?.user?.email) return empty
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return empty

  const [accounts, records] = await Promise.all([
    prisma.financialAccount.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    prisma.accountingRecord.findMany({
      where: { userId: user.id, parentRecordId: null },
      select: { accountId: true, income: true, expenses: true },
    }),
  ])

  // Only top-level records count toward balance — children (Egresos explaining a Retiro en
  // Efectivo, or split payments) share the same money as their parent, same rule as the running
  // balance in accounting/table.tsx and accounting/analysis/page.tsx. The `null` bucket catches
  // records with no account assigned (never set, or orphaned by a deleted FinancialAccount via
  // onDelete: SetNull).
  const balanceByAccountId = new Map<string | null, number>()
  for (const r of records) {
    const delta = Number(r.income ?? 0) - Number(r.expenses ?? 0)
    balanceByAccountId.set(r.accountId, (balanceByAccountId.get(r.accountId) ?? 0) + delta)
  }

  const accountsWithBalance: FinancialAccountWithBalance[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    bankAccountNumber: a.bankAccountNumber,
    balance: (balanceByAccountId.get(a.id) ?? 0).toString(),
  }))

  const unassignedBalance = (balanceByAccountId.get(null) ?? 0).toString()
  const totalBalance = (
    accountsWithBalance.reduce((s, a) => s + Number(a.balance), 0) + Number(unassignedBalance)
  ).toString()

  return { accounts: accountsWithBalance, unassignedBalance, totalBalance }
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

export async function updateFinancialAccountFull(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const user = await requireUser()

  const id = formData.get("id") as string
  const name = (formData.get("name") as string)?.trim()
  if (!name) return { error: "El nombre es requerido." }
  const type = (formData.get("type") as string) === "bank" ? "bank" : "cash"
  const bankAccountNumber = type === "bank" ? ((formData.get("bankAccountNumber") as string)?.trim() || null) : null

  if (bankAccountNumber) {
    const existing = await prisma.financialAccount.findUnique({ where: { bankAccountNumber } })
    if (existing && existing.id !== id) return { error: "Ya existe una cuenta con ese número." }
  }

  await prisma.financialAccount.update({ where: { id, userId: user.id }, data: { name, type, bankAccountNumber } })
  revalidatePath("/accounts")
  revalidatePath("/accounting")
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
