// Regenerates the stored PDFs for every accounting record of a unit. Needed after the unit's
// owner name or a concept changes: the receipt bakes both into the rendered file, so the copy in
// GCS keeps showing the old text until it is re-rendered.
//
//   npx tsx scripts/regenerate-unit-documents.ts "Apartamento 201"
import { prisma } from "../lib/db"
import { regenerateDocumentsFor } from "../lib/accounting/document-pdf"

async function main() {
  const unit = process.argv[2]
  if (!unit) {
    console.error('Falta la unidad. Uso: npx tsx scripts/regenerate-unit-documents.ts "Apartamento 201"')
    process.exitCode = 1
    return
  }

  const records = await prisma.accountingRecord.findMany({
    where: { property: unit },
    select: {
      id: true,
      date: true,
      concept: true,
      cashReceipts: { select: { number: true, pdfFileUrl: true } },
    },
    orderBy: { date: "asc" },
  })

  const withPdf = records.filter((r) => r.cashReceipts.some((cr) => cr.pdfFileUrl))
  console.log(`${unit}: ${records.length} registros, ${withPdf.length} con PDF a regenerar\n`)
  for (const r of withPdf) {
    const numbers = r.cashReceipts.filter((cr) => cr.pdfFileUrl).map((cr) => `#${cr.number}`).join(", ")
    console.log(`  ${r.date.toISOString().slice(0, 10)} | recibo ${numbers} | "${r.concept}"`)
  }

  if (withPdf.length === 0) return

  console.log("\nRegenerando...")
  await regenerateDocumentsFor({ recordIds: withPdf.map((r) => r.id) })
  console.log("Listo.")
}

main()
  .catch((e) => {
    console.error("FALLO:", e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
