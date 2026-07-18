// One-time (or --force re-run) backfill: renders and persists to GCS every generated PDF
// (recibo de caja, comprobante de egreso, cuenta de cobro) that doesn't have one yet.
// Usage:
//   npm run backfill:pdfs [-- --dry-run] [-- --force]
//   npx tsx scripts/backfill-document-pdfs.ts [--dry-run] [--force]
//
// --dry-run  lists what would be (re)rendered without writing anything.
// --force    also regenerates documents that already have a pdfFileUrl (e.g. after replacing
//            the administrator signature, which every recibo de caja embeds).
import "dotenv/config"
import { prisma } from "@/lib/db"
import {
  renderAndStoreCashReceiptPdf,
  renderAndStoreExpenseVoucherPdf,
  renderAndStoreInvoicePdf,
  runWithConcurrency,
} from "@/lib/accounting/document-pdf"

const args = new Set(process.argv.slice(2))
const dryRun = args.has("--dry-run")
const force = args.has("--force")

type Job = { label: string; run: () => Promise<unknown> }

async function main() {
  const [receipts, vouchers, invoices] = await Promise.all([
    prisma.cashReceipt.findMany({
      where: force ? {} : { pdfFileUrl: null },
      select: { id: true, number: true },
    }),
    prisma.expenseVoucher.findMany({
      where: force ? {} : { pdfFileUrl: null },
      select: { id: true, number: true },
    }),
    // Only "emitted" invoices (number assigned) have anything to render — see
    // renderAndStoreInvoicePdf's own guard.
    prisma.invoice.findMany({
      where: force ? { number: { not: null } } : { number: { not: null }, generatedPdfFileUrl: null },
      select: { id: true, number: true },
    }),
  ])

  const jobs: Job[] = [
    ...receipts.map((r): Job => ({
      label: `recibo de caja ${String(r.number).padStart(4, "0")} (${r.id})`,
      run: () => renderAndStoreCashReceiptPdf(r.id),
    })),
    ...vouchers.map((v): Job => ({
      label: `comprobante de egreso ${String(v.number).padStart(4, "0")} (${v.id})`,
      run: () => renderAndStoreExpenseVoucherPdf(v.id),
    })),
    ...invoices.map((i): Job => ({
      label: `cuenta de cobro ${String(i.number).padStart(4, "0")} (${i.id})`,
      run: () => renderAndStoreInvoicePdf(i.id),
    })),
  ]

  console.log(`${jobs.length} documento(s) por procesar${force ? " (--force: incluye los que ya tienen PDF)" : ""}.`)
  if (jobs.length === 0) return

  if (dryRun) {
    for (const job of jobs) console.log(`[dry-run] ${job.label}`)
    return
  }

  let ok = 0
  let failed = 0
  let done = 0
  await runWithConcurrency(
    jobs.map((job) => async () => {
      const result = await job.run()
      done++
      if (result) {
        ok++
        console.log(`[${done}/${jobs.length}] OK — ${job.label}`)
      } else {
        failed++
        console.error(`[${done}/${jobs.length}] FALLÓ — ${job.label}`)
      }
    }),
    5
  )

  console.log(`\nListo: ${ok} ok, ${failed} fallidos.`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error("[backfill-document-pdfs] error fatal:", err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
