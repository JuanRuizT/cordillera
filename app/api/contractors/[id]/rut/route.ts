import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { getRutSignedUrl } from "@/lib/contractors/gcs"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse("Unauthorized", { status: 401 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { id } = await params
  const contractor = await prisma.contractor.findFirst({ where: { id, userId: user.id } })

  if (!contractor?.rutFileUrl) return new NextResponse("Not found", { status: 404 })

  const url = await getRutSignedUrl(contractor.rutFileUrl, contractor.rutFileName ?? "rut.pdf")
  return NextResponse.redirect(url)
}
