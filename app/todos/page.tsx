import { prisma } from '@/lib/db'
import { BaseLayout } from '@/components/base-layout'
import { TodosClient } from './todo-form'

export default async function TodosPage() {
  const [todos, users] = await Promise.all([
    prisma.todo.findMany({
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
