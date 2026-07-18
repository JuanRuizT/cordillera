import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { previewAccountingDocumentsExport } from "@/lib/accounting/export-documents"

// Cheap preflight for the confirmation dialog — same planning pass as the real export, but no
// GCS downloads and no zip built, so it's fast enough to run before the user commits.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.email) return new NextResponse("Unauthorized", { status: 401 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  let ids: unknown
  try {
    ;({ ids } = await req.json())
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 })
  }
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string") || ids.length === 0) {
    return NextResponse.json({ error: "No se seleccionó ningún registro." }, { status: 400 })
  }

  const preview = await previewAccountingDocumentsExport(ids as string[], user.id)
  return NextResponse.json(preview)
}
