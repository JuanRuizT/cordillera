import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const documents = await prisma.ragDocument.findMany({
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

  return NextResponse.json({ documents })
}
