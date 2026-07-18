// Builds the "Descargar documentos" ZIP: given a set of AccountingRecord ids, downloads every
// related document (already persisted in GCS — see lib/accounting/document-pdf.tsx) and
// organizes them into one ZIP buffer. No rendering happens here; this is pure download-and-organize.
//
// The DB-only planning pass (which documents exist, how many files, how many records end up with
// nothing) is split out as `planAccountingDocumentsExport` so the "Descargar documentos" dialog can
// show a preflight count before the user commits to the actual download.
import JSZip from "jszip"
import { prisma } from "@/lib/db"
import { downloadFromGcs } from "@/lib/accounting/gcs"
import { runWithConcurrency } from "@/lib/accounting/document-pdf"
import {
  receiptBaseName,
  voucherBaseName,
  invoiceBaseName,
  plainRecordBaseName,
  attachmentName,
  extOf,
  dedupeName,
  sanitizeSegment,
} from "@/lib/accounting/export-naming"

export type ExportDocumentsResult = {
  zip: Buffer
  included: number
  skipped: number
  missingFiles: number
}

export type ExportDocumentsPreview = {
  fileCount: number
  included: number
  skipped: number
  missingFiles: number
}

type PendingFile = { target: JSZip; name: string; fileUrl: string }

type ExportPlan = {
  zip: JSZip
  pending: PendingFile[]
  included: number
  skipped: number
  missingFiles: number
}

async function planAccountingDocumentsExport(recordIds: string[], userId: string): Promise<ExportPlan> {
  const zip = new JSZip()

  if (recordIds.length === 0) {
    return { zip, pending: [], included: 0, skipped: 0, missingFiles: 0 }
  }

  const records = await prisma.accountingRecord.findMany({
    where: { id: { in: recordIds }, userId },
    select: {
      concept: true,
      date: true,
      property: true,
      bill: { select: { fileName: true, fileUrl: true } },
      socialSecurityPayment: { select: { fileName: true, fileUrl: true } },
      bankStatementId: true,
      bankStatement: { select: { fileName: true, fileUrl: true } },
      cashReceipts: { select: { number: true, pdfFileUrl: true }, orderBy: { number: "asc" } },
      expenseVoucher: { select: { number: true, pdfFileUrl: true } },
      paymentProofs: { select: { fileName: true, fileUrl: true }, orderBy: { createdAt: "asc" } },
      abono: { select: { invoiceId: true } },
    },
  })

  const rootNames = new Set<string>()
  const pending: PendingFile[] = []
  let included = 0
  let skipped = 0
  let missingFiles = 0

  // One copy of each distinct bank statement referenced, regardless of whether its records end
  // up contributing any document of their own.
  const statements = new Map<string, { fileName: string; fileUrl: string | null }>()
  for (const r of records) {
    if (r.bankStatementId && r.bankStatement && !statements.has(r.bankStatementId)) {
      statements.set(r.bankStatementId, r.bankStatement)
    }
  }
  for (const stmt of statements.values()) {
    if (!stmt.fileUrl) continue
    const name = dedupeName(rootNames, sanitizeSegment(`Extracto bancario - ${stmt.fileName}`))
    pending.push({ target: zip, name, fileUrl: stmt.fileUrl })
  }

  // Records linked to a cuenta de cobro (via Abono) are handled entirely by the invoice-folder
  // pass below, which pulls in every abono of that invoice — not just the ones in this selection.
  const invoiceRecordCount = new Map<string, number>()
  for (const r of records) {
    const invoiceId = r.abono?.invoiceId
    if (invoiceId) {
      invoiceRecordCount.set(invoiceId, (invoiceRecordCount.get(invoiceId) ?? 0) + 1)
      continue
    }

    let base: string | null = null
    let contributed = false

    if (r.cashReceipts.length > 0) {
      const first = r.cashReceipts[0]
      base = receiptBaseName({ number: first.number, date: r.date, concept: r.concept, property: r.property })
      if (first.pdfFileUrl) {
        pending.push({ target: zip, name: dedupeName(rootNames, `${base}.pdf`), fileUrl: first.pdfFileUrl })
        contributed = true
      } else {
        missingFiles++
      }
    } else if (r.expenseVoucher) {
      base = voucherBaseName({ number: r.expenseVoucher.number, date: r.date, concept: r.concept })
      if (r.expenseVoucher.pdfFileUrl) {
        pending.push({ target: zip, name: dedupeName(rootNames, `${base}.pdf`), fileUrl: r.expenseVoucher.pdfFileUrl })
        contributed = true
      } else {
        missingFiles++
      }
    }

    if (!base) base = plainRecordBaseName({ date: r.date, concept: r.concept, property: r.property })

    if (r.bill?.fileUrl) {
      const name = dedupeName(rootNames, attachmentName(base, "Factura", extOf(r.bill.fileName)))
      pending.push({ target: zip, name, fileUrl: r.bill.fileUrl })
      contributed = true
    }
    if (r.socialSecurityPayment?.fileUrl) {
      const name = dedupeName(rootNames, attachmentName(base, "Planilla seguridad social", extOf(r.socialSecurityPayment.fileName)))
      pending.push({ target: zip, name, fileUrl: r.socialSecurityPayment.fileUrl })
      contributed = true
    }
    r.paymentProofs.forEach((p, i) => {
      const idx = r.paymentProofs.length > 1 ? i + 1 : undefined
      const name = dedupeName(rootNames, attachmentName(base!, "Comprobante de pago", extOf(p.fileName), idx))
      pending.push({ target: zip, name, fileUrl: p.fileUrl })
      contributed = true
    })

    if (contributed) included++
    else skipped++
  }

  // One query for every distinct invoice touched, each pulling ALL of its abonos (not just the
  // ones the user selected) — a cuenta de cobro folder is always complete.
  const invoiceIds = [...invoiceRecordCount.keys()]
  const invoices = invoiceIds.length
    ? await prisma.invoice.findMany({
        where: { id: { in: invoiceIds }, userId },
        select: {
          id: true,
          number: true,
          date: true,
          concept: true,
          fileName: true,
          fileUrl: true,
          generatedPdfFileUrl: true,
          contractor: { select: { name: true, rutFileName: true, rutFileUrl: true } },
          abonos: {
            select: {
              accountingRecord: {
                select: {
                  concept: true,
                  date: true,
                  expenseVoucher: { select: { number: true, pdfFileUrl: true } },
                  paymentProofs: { select: { fileName: true, fileUrl: true }, orderBy: { createdAt: "asc" } },
                },
              },
            },
            orderBy: { date: "asc" },
          },
        },
      })
    : []

  const invoiceContributed = new Map<string, boolean>()
  for (const invoice of invoices) {
    // No consecutive number yet means it was never emitted — nothing was ever rendered for it.
    if (invoice.number == null) {
      invoiceContributed.set(invoice.id, false)
      continue
    }

    const folderBase = invoiceBaseName({ number: invoice.number, date: invoice.date, concept: invoice.concept })
    const folder = zip.folder(folderBase)!
    const folderNames = new Set<string>()
    let contributed = false

    if (invoice.generatedPdfFileUrl) {
      pending.push({ target: folder, name: dedupeName(folderNames, `${folderBase}.pdf`), fileUrl: invoice.generatedPdfFileUrl })
      contributed = true
    } else {
      missingFiles++
    }

    if (invoice.fileUrl) {
      const name = dedupeName(folderNames, `Cuenta de cobro (contratista)${extOf(invoice.fileName)}`)
      pending.push({ target: folder, name, fileUrl: invoice.fileUrl })
      contributed = true
    }

    if (invoice.contractor.rutFileUrl) {
      const name = dedupeName(folderNames, `RUT - ${sanitizeSegment(invoice.contractor.name)}${extOf(invoice.contractor.rutFileName)}`)
      pending.push({ target: folder, name, fileUrl: invoice.contractor.rutFileUrl })
      contributed = true
    }

    for (const a of invoice.abonos) {
      const ar = a.accountingRecord
      if (!ar || !ar.expenseVoucher) continue // manual abono (no record) — nothing to attach

      const vBase = voucherBaseName({ number: ar.expenseVoucher.number, date: ar.date, concept: ar.concept })
      if (ar.expenseVoucher.pdfFileUrl) {
        pending.push({ target: folder, name: dedupeName(folderNames, `${vBase}.pdf`), fileUrl: ar.expenseVoucher.pdfFileUrl })
        contributed = true
      } else {
        missingFiles++
      }
      ar.paymentProofs.forEach((p, i) => {
        const idx = ar.paymentProofs.length > 1 ? i + 1 : undefined
        const name = dedupeName(folderNames, attachmentName(vBase, "Comprobante de pago", extOf(p.fileName), idx))
        pending.push({ target: folder, name, fileUrl: p.fileUrl })
        contributed = true
      })
    }

    invoiceContributed.set(invoice.id, contributed)
  }

  for (const [invoiceId, count] of invoiceRecordCount) {
    const contributed = invoiceContributed.get(invoiceId) ?? false
    if (contributed) included += count
    else skipped += count
  }

  return { zip, pending, included, skipped, missingFiles }
}

// Cheap preflight for the confirmation dialog: runs the same DB-only planning pass (no GCS
// downloads, no zip serialization) so the user can see how many files/records are involved
// before committing to the real download.
export async function previewAccountingDocumentsExport(recordIds: string[], userId: string): Promise<ExportDocumentsPreview> {
  const { pending, included, skipped, missingFiles } = await planAccountingDocumentsExport(recordIds, userId)
  return { fileCount: pending.length, included, skipped, missingFiles }
}

export async function buildAccountingDocumentsZip(recordIds: string[], userId: string): Promise<ExportDocumentsResult> {
  const { zip, pending, included, skipped, missingFiles } = await planAccountingDocumentsExport(recordIds, userId)

  const failedDownloads = { count: 0 }
  await runWithConcurrency(
    pending.map((p) => async () => {
      try {
        const buffer = await downloadFromGcs(p.fileUrl)
        p.target.file(p.name, buffer)
      } catch (err) {
        failedDownloads.count++
        console.error(`[export-documents] failed to download ${p.fileUrl}:`, err)
      }
    }),
    6
  )

  const buffer = await zip.generateAsync({ type: "nodebuffer" })
  return { zip: buffer, included, skipped, missingFiles: missingFiles + failedDownloads.count }
}
