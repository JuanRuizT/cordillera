import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { getInvoiceSignedUrl } from "@/lib/invoices/gcs"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse("Unauthorized", { status: 401 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { id } = await params
  const invoice = await prisma.invoice.findFirst({ where: { id, userId: user.id } })

  if (!invoice?.fileUrl) return new NextResponse("Not found", { status: 404 })

  const url = await getInvoiceSignedUrl(invoice.fileUrl, invoice.fileName ?? "cuenta-de-cobro.pdf")
  return NextResponse.redirect(url)
}
