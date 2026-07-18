import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { getPaymentProofSignedUrl } from "@/lib/accounting/gcs"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse("Unauthorized", { status: 401 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { id } = await params
  const record = await prisma.accountingRecord.findFirst({ where: { id, userId: user.id } })

  if (!record?.paymentProofFileUrl) return new NextResponse("Not found", { status: 404 })

  const url = await getPaymentProofSignedUrl(record.paymentProofFileUrl, record.paymentProofFileName ?? "comprobante-de-pago")
  return NextResponse.redirect(url)
}
