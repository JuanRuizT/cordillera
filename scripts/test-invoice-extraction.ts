// Runs the cuentas de cobro extractor over the most recent invoices that have a PDF in GCS and
// compares what the model reads against the values already saved for each invoice. Makes real
// LLM calls (each logs an AiCallLog row, as usual). Read-only against the database.
//
//   npx tsx scripts/test-invoice-extraction.ts [cuántas, por defecto 5]
import { prisma } from "../lib/db"
import { getInvoiceSignedUrl } from "../lib/invoices/gcs"
import { extractInvoiceFields } from "../lib/invoices/extract"
import { GEMINI_MODEL_CHAIN } from "../lib/ai/models"

function check(label: string, actual: unknown, expected: unknown): boolean {
  const ok = actual === expected
  console.log(`    ${ok ? "✓" : "✗"} ${label}: ${JSON.stringify(actual)}${ok ? "" : `  (guardado ${JSON.stringify(expected)})`}`)
  return ok
}

async function main() {
  const limit = Number(process.argv[2] ?? 5)
  const invoices = await prisma.invoice.findMany({
    where: { fileUrl: { not: null } },
    orderBy: { date: "desc" },
    take: limit,
    include: { contractor: { select: { name: true, idNumber: true } } },
  })
  console.log(`Modelos: ${GEMINI_MODEL_CHAIN.join(" → ")} · ${invoices.length} cuentas de cobro con PDF\n`)

  let mismatches = 0
  for (const inv of invoices) {
    const url = await getInvoiceSignedUrl(inv.fileUrl!, inv.fileName ?? "cuenta-de-cobro.pdf")
    const buffer = Buffer.from(await (await fetch(url)).arrayBuffer())

    const started = Date.now()
    const res = await extractInvoiceFields(buffer, { userId: inv.userId })
    const secs = ((Date.now() - started) / 1000).toFixed(1)

    console.log(`#${inv.number ?? "—"} ${inv.fileName}  (${secs}s)`)
    if (!res.ok || !res.data) {
      console.log(`    ✗ falló: ${res.error}`)
      mismatches++
      continue
    }
    const d = res.data
    const results = [
      check("totalAmount", d.totalAmount, Number(inv.totalAmount)),
      check("retentionRate", d.retentionRate, inv.retentionRate != null ? Number(inv.retentionRate) : null),
      check("contractorIdNumber", d.contractorIdNumber, inv.contractor.idNumber),
    ]
    // Informative only: the saved date/concept may have been edited by hand after upload.
    console.log(`      date: ${JSON.stringify(d.date)} (guardado ${inv.date.toISOString().slice(0, 10)}) · confidence: ${d.confidence}`)
    console.log(`      concept: ${JSON.stringify(d.concept)}`)
    if (results.includes(false)) mismatches++
  }

  console.log(`\n${mismatches === 0 ? "Todas coinciden." : `${mismatches} con diferencias (revisar: pueden ser ediciones manuales posteriores).`}`)
}

main()
  .catch((e) => {
    console.error("FALLO:", e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
