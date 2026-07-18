import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { deleteFromGcs } from "@/lib/rag/gcs"
import { NextResponse } from "next/server"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const { id } = await params

  const document = await prisma.ragDocument.findUnique({ where: { id } })
  if (!document || document.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Delete from GCS
  try {
    await deleteFromGcs(document.gcsPath)
  } catch (err) {
    console.error("GCS delete error:", err)
  }

  // Delete from DB (cascades chunks)
  await prisma.ragDocument.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
