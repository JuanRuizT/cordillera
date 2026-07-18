"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { redirect } from "next/navigation"

async function requireUser() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")
  return user
}

export async function updateOwnerMonthlyFee(unit: string, value: string): Promise<{ error: string | null }> {
  await requireUser()

  const trimmed = value.trim()
  const fee = trimmed === "" ? null : Number(trimmed)
  if (fee != null && (!Number.isFinite(fee) || fee < 0)) {
    return { error: "La cuota debe ser un número válido." }
  }

  await prisma.owner.update({ where: { unit }, data: { monthlyFee: fee } })
  revalidatePath("/accounting/paz-y-salvo")
  return { error: null }
}
