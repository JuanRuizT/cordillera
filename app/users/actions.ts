'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function createUser(_prevState: null, formData: FormData) {
  const name = formData.get('name') as string | null
  const email = formData.get('email') as string

  await prisma.user.create({
    data: { name: name || null, email },
  })

  revalidatePath('/users')
  return null
}

export async function updateUser(_prevState: null, formData: FormData) {
  const id = formData.get('id') as string
  const name = formData.get('name') as string | null
  const email = formData.get('email') as string

  await prisma.user.update({
    where: { id },
    data: { name: name || null, email },
  })

  revalidatePath('/users')
  return null
}

export async function deleteUser(formData: FormData) {
  const id = formData.get('id') as string

  await prisma.user.delete({ where: { id } })

  revalidatePath('/users')
}
