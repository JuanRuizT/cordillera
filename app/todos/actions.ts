'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function createTodo(_prevState: null, formData: FormData) {
  const title = formData.get('title') as string
  const description = formData.get('description') as string | null
  const authorId = parseInt(formData.get('authorId') as string)

  await prisma.todo.create({
    data: { title, description: description || null, authorId },
  })

  revalidatePath('/todos')
  return null
}

export async function updateTodo(_prevState: null, formData: FormData) {
  const id = parseInt(formData.get('id') as string)
  const title = formData.get('title') as string
  const description = formData.get('description') as string | null
  const authorId = parseInt(formData.get('authorId') as string)

  await prisma.todo.update({
    where: { id },
    data: { title, description: description || null, authorId },
  })

  revalidatePath('/todos')
  return null
}

export async function deleteTodo(formData: FormData) {
  const id = parseInt(formData.get('id') as string)

  await prisma.todo.delete({ where: { id } })

  revalidatePath('/todos')
}

export async function toggleTodo(formData: FormData) {
  const id = parseInt(formData.get('id') as string)
  const completed = formData.get('completed') === 'true'

  await prisma.todo.update({
    where: { id },
    data: { completed: !completed },
  })

  revalidatePath('/todos')
}
