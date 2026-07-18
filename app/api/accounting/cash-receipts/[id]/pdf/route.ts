import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { renderAndStoreCashReceiptPdf } from "@/lib/accounting/document-pdf"

// Always re-renders (with live data) and overwrites the GCS copy before serving it — "Descargar
// PDF" doubles as a manual refresh, so the file in the bucket can never drift from what the user
// actually downloads.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse("Unauthorized", { status: 401 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { id } = await params
  const receipt = await prisma.cashReceipt.findFirst({ where: { id, userId: user.id }, select: { number: true } })
  if (!receipt) return new NextResponse("Not found", { status: 404 })

  const rendered = await renderAndStoreCashReceiptPdf(id)
  if (!rendered) return new NextResponse("No se pudo generar el PDF.", { status: 500 })

  const filename = `Recibo-${String(receipt.number).padStart(4, "0")}.pdf`
  return new NextResponse(new Uint8Array(rendered.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
