"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { uploadRutFile, deleteRutFile } from "@/lib/contractors/gcs"

const ALLOWED_RUT_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"]

export type ContractorData = {
  id: string
  name: string
  idType: string
  idNumber: string
  bankName: string | null
  bankAccount: string | null
  bankAccountType: string | null
  phone: string | null
  email: string | null
  rutFileName: string | null
  rutFileUrl: string | null
}

async function requireUser() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")
  return user
}

export async function listContractors(): Promise<ContractorData[]> {
  const session = await auth()
  if (!session?.user?.email) return []
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return []
  const contractors = await prisma.contractor.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
  })
  return contractors.map((c) => ({
    id: c.id,
    name: c.name,
    idType: c.idType,
    idNumber: c.idNumber,
    bankName: c.bankName,
    bankAccount: c.bankAccount,
    bankAccountType: c.bankAccountType,
    phone: c.phone,
    email: c.email,
    rutFileName: c.rutFileName,
    rutFileUrl: c.rutFileUrl,
  }))
}

export async function createContractor(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const user = await requireUser()

  const name = (formData.get("name") as string)?.trim()
  if (!name) return { error: "El nombre es requerido." }
  const idNumber = (formData.get("idNumber") as string)?.trim()
  if (!idNumber) return { error: "La C.C / NIT es requerida." }

  const existing = await prisma.contractor.findUnique({ where: { idNumber } })
  if (existing) return { error: "Ya existe un contratista con esa C.C / NIT." }

  await prisma.contractor.create({
    data: {
      name,
      idType: (formData.get("idType") as string) || "CC",
      idNumber,
      bankName: (formData.get("bankName") as string)?.trim() || null,
      bankAccount: (formData.get("bankAccount") as string)?.trim() || null,
      bankAccountType: (formData.get("bankAccountType") as string)?.trim() || null,
      phone: (formData.get("phone") as string)?.trim() || null,
      email: (formData.get("email") as string)?.trim() || null,
      userId: user.id,
    },
  })

  revalidatePath("/contractors")
  return { error: null }
}

// Lightweight create used for inline creation from the voucher dialog.
export async function createContractorInline(input: {
  name: string
  idType?: string
  idNumber: string
}): Promise<{ contractor: ContractorData | null; error: string | null }> {
  const user = await requireUser()
  const name = input.name.trim()
  const idNumber = input.idNumber.trim()
  if (!name) return { contractor: null, error: "El nombre es requerido." }
  if (!idNumber) return { contractor: null, error: "La C.C / NIT es requerida." }

  const existing = await prisma.contractor.findUnique({ where: { idNumber } })
  if (existing) return { contractor: null, error: "Ya existe un contratista con esa C.C / NIT." }

  const c = await prisma.contractor.create({
    data: {
      name,
      idType: input.idType || "CC",
      idNumber,
      userId: user.id,
    },
  })
  revalidatePath("/contractors")
  return {
    contractor: {
      id: c.id,
      name: c.name,
      idType: c.idType,
      idNumber: c.idNumber,
      bankName: c.bankName,
      bankAccount: c.bankAccount,
      bankAccountType: c.bankAccountType,
      phone: c.phone,
      email: c.email,
      rutFileName: c.rutFileName,
      rutFileUrl: c.rutFileUrl,
    },
    error: null,
  }
}

export async function updateContractor(id: string, field: string, value: string) {
  const user = await requireUser()

  const allowed = ["name", "idType", "idNumber", "bankName", "bankAccount", "bankAccountType", "phone", "email"]
  if (!allowed.includes(field)) return

  const data: Record<string, unknown> = {}
  const trimmed = value.trim()
  switch (field) {
    case "name":
      if (!trimmed) return
      data.name = trimmed
      break
    case "idNumber":
      if (!trimmed) return
      data.idNumber = trimmed
      break
    case "idType":
      data[field] = trimmed || "CC"
      break
    default:
      data[field] = trimmed || null
  }

  await prisma.contractor.update({ where: { id, userId: user.id }, data })
  revalidatePath("/contractors")
}

export async function deleteContractor(id: string): Promise<{ error: string | null }> {
  const user = await requireUser()
  await prisma.contractor.delete({ where: { id, userId: user.id } })
  revalidatePath("/contractors")
  return { error: null }
}

export async function uploadRut(
  contractorId: string,
  formData: FormData
): Promise<{ error: string | null; fileName: string | null; fileUrl: string | null }> {
  const user = await requireUser()

  const contractor = await prisma.contractor.findUnique({ where: { id: contractorId, userId: user.id } })
  if (!contractor) return { error: "Contratista no encontrado", fileName: null, fileUrl: null }

  const file = formData.get("file") as File | null
  if (!file || file.size === 0) return { error: "Selecciona un archivo.", fileName: null, fileUrl: null }

  const ext = file.name.toLowerCase().split(".").pop() ?? ""
  if (!ALLOWED_RUT_EXTENSIONS.includes(ext)) {
    return { error: "El RUT debe ser PDF, JPG o PNG.", fileName: null, fileUrl: null }
  }

  if (contractor.rutFileUrl) await deleteRutFile(contractor.rutFileUrl).catch(console.error)

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const fileUrl = await uploadRutFile(buffer, file.name, file.type || "application/octet-stream")
    await prisma.contractor.update({
      where: { id: contractorId },
      data: { rutFileName: file.name, rutFileUrl: fileUrl },
    })
    revalidatePath("/contractors")
    return { error: null, fileName: file.name, fileUrl }
  } catch (err) {
    console.error("[uploadRut] GCS upload error:", err)
    return { error: "No se pudo subir el RUT. Intenta de nuevo.", fileName: null, fileUrl: null }
  }
}

export async function deleteRut(contractorId: string): Promise<{ error: string | null }> {
  const user = await requireUser()

  const contractor = await prisma.contractor.findUnique({ where: { id: contractorId, userId: user.id } })
  if (!contractor) return { error: "Contratista no encontrado" }
  if (!contractor.rutFileUrl) return { error: null }

  await deleteRutFile(contractor.rutFileUrl).catch(console.error)
  await prisma.contractor.update({
    where: { id: contractorId },
    data: { rutFileName: null, rutFileUrl: null },
  })
  revalidatePath("/contractors")
  return { error: null }
}
