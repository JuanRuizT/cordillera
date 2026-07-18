"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { currentMonthInColombia, feeInEffect } from "@/lib/owner-fees"

async function requireUser() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")
  return user
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

// Owner.monthlyFee is a denormalized "current fee" (the AI classifier reads it as the unit's fee).
// Recompute it from the history after every change so the two can never disagree.
async function syncCurrentFee(ownerId: string) {
  const fees = await prisma.ownerFee.findMany({ where: { ownerId }, select: { fromMonth: true, amount: true } })
  const current = feeInEffect(
    fees.map((f) => ({ fromMonth: f.fromMonth, amount: Number(f.amount) })),
    currentMonthInColombia()
  )
  await prisma.owner.update({ where: { id: ownerId }, data: { monthlyFee: current } })
}

// Adds a fee step for a unit, or — when a step already starts that same month — corrects its amount.
export async function saveOwnerFee(unit: string, fromMonth: string, amount: string): Promise<{ error: string | null }> {
  await requireUser()

  if (!MONTH_RE.test(fromMonth)) return { error: "Elegí el mes desde el que rige la cuota." }
  const trimmed = amount.trim()
  const value = Number(trimmed)
  if (!trimmed || !Number.isFinite(value) || value <= 0) return { error: "La cuota debe ser mayor a 0." }

  const owner = await prisma.owner.findUnique({ where: { unit }, select: { id: true } })
  if (!owner) return { error: "Unidad no encontrada." }

  await prisma.ownerFee.upsert({
    where: { ownerId_fromMonth: { ownerId: owner.id, fromMonth } },
    create: { ownerId: owner.id, fromMonth, amount: value },
    update: { amount: value },
  })
  await syncCurrentFee(owner.id)

  revalidatePath("/accounting/paz-y-salvo")
  return { error: null }
}

export async function deleteOwnerFee(id: string): Promise<{ error: string | null }> {
  await requireUser()

  const fee = await prisma.ownerFee.findUnique({ where: { id }, select: { ownerId: true } })
  if (!fee) return { error: "Tramo no encontrado." }

  await prisma.ownerFee.delete({ where: { id } })
  await syncCurrentFee(fee.ownerId)

  revalidatePath("/accounting/paz-y-salvo")
  return { error: null }
}
