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
  const proof = await prisma.paymentProof.findFirst({
    where: { id, accountingRecord: { userId: user.id } },
  })

  if (!proof) return new NextResponse("Not found", { status: 404 })

  const url = await getPaymentProofSignedUrl(proof.fileUrl, proof.fileName)
  return NextResponse.redirect(url)
}
