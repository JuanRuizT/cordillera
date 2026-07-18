// Server-only: renders the three generated accounting PDFs (recibo de caja, comprobante de
// egreso, cuenta de cobro) and persists them to GCS at a deterministic path, so exporting
// documents later is pure download-and-organize instead of render-on-demand.
//
// Every mutation that changes what one of these PDFs would show must call
// `regenerateDocumentsFor` right before its `revalidatePath` — see the call sites in
// app/accounting/actions.ts, app/invoices/actions.ts and app/contractors/actions.ts.
import { renderToBuffer } from "@react-pdf/renderer"
import { prisma } from "@/lib/db"
import { getSignatureDataUrl } from "@/lib/signature"
import { uploadToGcsPath, deleteFromGcs } from "@/lib/accounting/gcs"
import { buildReceiptData, buildVoucherData } from "@/lib/accounting/document-data"
import { toInvoiceData } from "@/lib/invoices/document-data"
import { CashReceiptPDF } from "@/lib/pdf/cash-receipt-document"
import { ExpenseVoucherPDF } from "@/lib/pdf/expense-voucher-document"
import { InvoicePDF } from "@/lib/pdf/invoice-document"

// Deterministic (not Date.now()-prefixed like the upload-attachment paths): regenerating a
// document must overwrite the same GCS object rather than leaving the previous version orphaned.
const receiptPdfPath = (id: string) => `recibos-caja/${id}.pdf`
const voucherPdfPath = (id: string) => `comprobantes-egreso/${id}.pdf`
const invoicePdfPath = (id: string) => `cuentas-cobro-generadas/${id}.pdf`

export async function runWithConcurrency(tasks: Array<() => Promise<unknown>>, limit: number): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const task = tasks[next++]
      await task()
    }
  })
  await Promise.all(workers)
}

type StoredPdf = { buffer: Buffer; fileUrl: string }

// Exported (in addition to being used internally by regenerateDocumentsFor below) so
// scripts/backfill-document-pdfs.ts and the "Descargar PDF" download routes can call them
// directly — the download routes reuse the freshly-rendered buffer instead of reading it back
// from GCS, so "descargar" always regenerates-then-serves rather than trusting a possibly-stale copy.
export async function renderAndStoreCashReceiptPdf(receiptId: string): Promise<StoredPdf | null> {
  try {
    const cr = await prisma.cashReceipt.findUnique({
      where: { id: receiptId },
      include: { accountingRecord: { include: { account: true } } },
    })
    if (!cr || !cr.accountingRecord) return null
    const record = cr.accountingRecord

    let recipientName = ""
    if (record.property) {
      const owner = await prisma.owner.findFirst({ where: { unit: record.property } })
      recipientName = owner?.name ?? ""
    }

    const data = buildReceiptData(cr, record, recipientName)
    const signatureDataUrl = await getSignatureDataUrl()
    const buffer = await renderToBuffer(<CashReceiptPDF receipt={data} signatureDataUrl={signatureDataUrl} />)
    const fileUrl = await uploadToGcsPath(receiptPdfPath(receiptId), buffer, "application/pdf")

    await prisma.cashReceipt.update({ where: { id: receiptId }, data: { pdfFileUrl: fileUrl, pdfUpdatedAt: new Date() } })
    return { buffer, fileUrl }
  } catch (err) {
    console.error(`[document-pdf] failed to render/store cash receipt ${receiptId}:`, err)
    return null
  }
}

export async function renderAndStoreExpenseVoucherPdf(voucherId: string): Promise<StoredPdf | null> {
  try {
    const v = await prisma.expenseVoucher.findUnique({
      where: { id: voucherId },
      include: { accountingRecord: { include: { account: true } }, contractor: true },
    })
    if (!v || !v.accountingRecord) return null

    const data = buildVoucherData(v, v.accountingRecord, v.contractor)
    const buffer = await renderToBuffer(<ExpenseVoucherPDF voucher={data} />)
    const fileUrl = await uploadToGcsPath(voucherPdfPath(voucherId), buffer, "application/pdf")

    await prisma.expenseVoucher.update({ where: { id: voucherId }, data: { pdfFileUrl: fileUrl, pdfUpdatedAt: new Date() } })
    return { buffer, fileUrl }
  } catch (err) {
    console.error(`[document-pdf] failed to render/store expense voucher ${voucherId}:`, err)
    return null
  }
}

export async function renderAndStoreInvoicePdf(invoiceId: string): Promise<StoredPdf | null> {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        contractor: { select: { name: true, idNumber: true } },
        abonos: {
          select: {
            id: true,
            date: true,
            amount: true,
            accountingRecordId: true,
            accountingRecord: {
              select: {
                date: true,
                expenses: true,
                paymentProofs: { select: { id: true } },
              },
            },
          },
          orderBy: { date: "asc" },
        },
      },
    })
    // No consecutive number yet means the cuenta de cobro was never "emitted" (generateInvoiceDocument)
    // — nothing to render until then.
    if (!invoice || invoice.number == null) return null

    const data = toInvoiceData(invoice)
    const buffer = await renderToBuffer(<InvoicePDF invoice={data} />)
    const fileUrl = await uploadToGcsPath(invoicePdfPath(invoiceId), buffer, "application/pdf")

    await prisma.invoice.update({ where: { id: invoiceId }, data: { generatedPdfFileUrl: fileUrl, generatedPdfUpdatedAt: new Date() } })
    return { buffer, fileUrl }
  } catch (err) {
    console.error(`[document-pdf] failed to render/store invoice ${invoiceId}:`, err)
    return null
  }
}

type RegenerateOptions = {
  // Ids to (re)render unconditionally — pass ids that were just created (their pdfFileUrl is
  // still null) or whose own field changed directly.
  receiptIds?: string[]
  voucherIds?: string[]
  invoiceIds?: string[]
  // Fan-out: records/contractors whose data changed. Only documents that ALREADY have a
  // pdfFileUrl are queued from these — a record with no receipt yet has nothing to regenerate.
  recordIds?: string[]
  contractorIds?: string[]
}

// Resolves every document affected by a mutation and (re)renders them, uploading to GCS and
// updating each row's pdfFileUrl. Never throws — a GCS/render failure is logged and skipped so it
// can never roll back the accounting mutation that triggered it.
export async function regenerateDocumentsFor(opts: RegenerateOptions): Promise<void> {
  const receiptIds = new Set(opts.receiptIds ?? [])
  const voucherIds = new Set(opts.voucherIds ?? [])
  const invoiceIds = new Set(opts.invoiceIds ?? [])

  if (opts.recordIds?.length) {
    const records = await prisma.accountingRecord.findMany({
      where: { id: { in: opts.recordIds } },
      select: {
        cashReceipts: { select: { id: true, pdfFileUrl: true } },
        expenseVoucher: { select: { id: true, pdfFileUrl: true } },
        abono: { select: { invoice: { select: { id: true, generatedPdfFileUrl: true } } } },
      },
    })
    for (const r of records) {
      for (const cr of r.cashReceipts) if (cr.pdfFileUrl) receiptIds.add(cr.id)
      if (r.expenseVoucher?.pdfFileUrl) voucherIds.add(r.expenseVoucher.id)
      if (r.abono?.invoice.generatedPdfFileUrl) invoiceIds.add(r.abono.invoice.id)
    }
  }

  if (opts.contractorIds?.length) {
    const [vouchers, invoices] = await Promise.all([
      prisma.expenseVoucher.findMany({
        where: { contractorId: { in: opts.contractorIds }, pdfFileUrl: { not: null } },
        select: { id: true },
      }),
      prisma.invoice.findMany({
        where: { contractorId: { in: opts.contractorIds }, generatedPdfFileUrl: { not: null } },
        select: { id: true },
      }),
    ])
    vouchers.forEach((v) => voucherIds.add(v.id))
    invoices.forEach((i) => invoiceIds.add(i.id))
  }

  // A voucher's number/contractor is printed in its linked invoice's abonos table — whenever a
  // voucher is (re)generated, also refresh the invoice it belongs to (if that invoice already has
  // a generated PDF; otherwise it was never emitted and there's nothing to keep in sync).
  if (voucherIds.size > 0) {
    const linked = await prisma.expenseVoucher.findMany({
      where: { id: { in: [...voucherIds] } },
      select: {
        accountingRecord: { select: { abono: { select: { invoice: { select: { id: true, generatedPdfFileUrl: true } } } } } },
      },
    })
    for (const v of linked) {
      const invoice = v.accountingRecord?.abono?.invoice
      if (invoice?.generatedPdfFileUrl) invoiceIds.add(invoice.id)
    }
  }

  const tasks: Array<() => Promise<unknown>> = [
    ...[...receiptIds].map((id) => () => renderAndStoreCashReceiptPdf(id)),
    ...[...voucherIds].map((id) => () => renderAndStoreExpenseVoucherPdf(id)),
    ...[...invoiceIds].map((id) => () => renderAndStoreInvoicePdf(id)),
  ]
  if (tasks.length === 0) return
  await runWithConcurrency(tasks, 5)
}

export async function deleteCashReceiptPdf(fileUrl: string | null | undefined): Promise<void> {
  if (!fileUrl) return
  await deleteFromGcs(fileUrl).catch((err) => console.error("[document-pdf] failed to delete cash receipt pdf:", err))
}

export async function deleteExpenseVoucherPdf(fileUrl: string | null | undefined): Promise<void> {
  if (!fileUrl) return
  await deleteFromGcs(fileUrl).catch((err) => console.error("[document-pdf] failed to delete expense voucher pdf:", err))
}

export async function deleteInvoicePdf(fileUrl: string | null | undefined): Promise<void> {
  if (!fileUrl) return
  await deleteFromGcs(fileUrl).catch((err) => console.error("[document-pdf] failed to delete invoice pdf:", err))
}
