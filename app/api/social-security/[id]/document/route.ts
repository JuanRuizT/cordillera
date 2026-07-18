import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { getSocialSecuritySignedUrl } from "@/lib/social-security/gcs"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse("Unauthorized", { status: 401 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { id } = await params
  const entry = await prisma.socialSecurityPayment.findFirst({ where: { id, userId: user.id } })

  if (!entry?.fileUrl) return new NextResponse("Not found", { status: 404 })

  const url = await getSocialSecuritySignedUrl(entry.fileUrl, entry.fileName ?? "planilla")
  return NextResponse.redirect(url)
}
