import { prisma } from '@/lib/db'
import { BaseLayout } from '@/components/base-layout'
import { TodosClient } from './todo-form'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'

export default async function TodosPage() {
  const session = await auth()

  if (!session?.user?.email) {
    redirect('/login')
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  })

  if (!user) {
    redirect('/login')
  }

  const [todos, users] = await Promise.all([
    prisma.todo.findMany({
      where: { authorId: user.id },
      include: { author: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.findMany({ orderBy: { name: 'asc' } }),
  ])

  return (
    <BaseLayout>
      <TodosClient todos={todos} users={users} />
    </BaseLayout>
  )
}
