-- Move the invoice link from ExpenseVoucher to AccountingRecord.

-- AccountingRecord gets the invoice link
ALTER TABLE "AccountingRecord" ADD COLUMN "invoiceId" TEXT;
ALTER TABLE "AccountingRecord" ADD CONSTRAINT "AccountingRecord_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve existing links (voucher -> its accounting record)
UPDATE "AccountingRecord" ar SET "invoiceId" = ev."invoiceId"
FROM "ExpenseVoucher" ev
WHERE ev."accountingRecordId" = ar."id" AND ev."invoiceId" IS NOT NULL;

-- Remove the link from the voucher
ALTER TABLE "ExpenseVoucher" DROP CONSTRAINT "ExpenseVoucher_invoiceId_fkey";
ALTER TABLE "ExpenseVoucher" DROP COLUMN "invoiceId";
