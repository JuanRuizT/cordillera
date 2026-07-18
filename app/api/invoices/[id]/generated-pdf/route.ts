import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { renderAndStoreInvoicePdf } from "@/lib/accounting/document-pdf"

// The cuenta de cobro *generada* by the app — not the contractor's own uploaded PDF, which is
// served by /api/invoices/[id]/download instead. Always re-renders and overwrites the GCS copy
// before serving it, so the bucket file can never drift from what the user actually downloads.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse("Unauthorized", { status: 401 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { id } = await params
  const invoice = await prisma.invoice.findFirst({ where: { id, userId: user.id }, select: { number: true } })
  if (!invoice) return new NextResponse("Not found", { status: 404 })
  if (invoice.number == null) return new NextResponse("La cuenta de cobro aún no tiene número asignado.", { status: 400 })

  const rendered = await renderAndStoreInvoicePdf(id)
  if (!rendered) return new NextResponse("No se pudo generar el PDF.", { status: 500 })

  const filename = `Cuenta-Cobro-${String(invoice.number).padStart(4, "0")}.pdf`
  return new NextResponse(new Uint8Array(rendered.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
