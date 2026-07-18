import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { buildAccountingDocumentsZip } from "@/lib/accounting/export-documents"
import { todayStamp } from "@/lib/date-format"

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

  const { zip, included, skipped, missingFiles } = await buildAccountingDocumentsZip(ids as string[], user.id)

  if (included === 0) {
    return NextResponse.json({ error: "Ninguno de los registros seleccionados tiene documentos para exportar." }, { status: 404 })
  }

  const today = todayStamp()
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="documentos-contabilidad-${today}.zip"`,
      "X-Export-Included": String(included),
      "X-Export-Skipped": String(skipped),
      "X-Export-Missing-Files": String(missingFiles),
    },
  })
}
