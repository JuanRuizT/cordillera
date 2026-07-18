import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { BaseLayout } from "@/components/base-layout"
import { RagDashboard } from "./rag-dashboard"

export default async function DemoRagPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")

  const rawDocs = await prisma.ragDocument.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      originalName: true,
      mimeType: true,
      status: true,
      pageCount: true,
      errorMessage: true,
      createdAt: true,
      _count: { select: { chunks: true } },
    },
  })
  const documents = rawDocs.map((d) => ({
    ...d,
    status: d.status as "processing" | "ready" | "error",
  }))

  const isConfigured = !!(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY &&
    process.env.GOOGLE_CLOUD_BUCKET_NAME &&
    process.env.GOOGLE_CLOUD_SA_KEY
  )

  return (
    <BaseLayout>
      <RagDashboard initialDocuments={documents} isConfigured={isConfigured} />
    </BaseLayout>
  )
}
