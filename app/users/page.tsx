import { prisma } from '@/lib/db'
import { BaseLayout } from '@/components/base-layout'
import { UsersClient } from './user-form'

export default async function UsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { ragDocuments: true } } },
  })

  return (
    <BaseLayout>
      <UsersClient users={users} />
    </BaseLayout>
  )
}
