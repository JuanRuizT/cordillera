import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { getBillDocumentSignedUrl } from "@/lib/bills/gcs"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse("Unauthorized", { status: 401 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { id } = await params
  const bill = await prisma.bill.findFirst({ where: { id, userId: user.id } })

  if (!bill?.fileUrl) return new NextResponse("Not found", { status: 404 })

  const url = await getBillDocumentSignedUrl(bill.fileUrl, bill.fileName ?? "factura")
  return NextResponse.redirect(url)
}
