-- AlterTable: attach the actual bill/invoice document to "Facturas" category records,
-- same shape as the existing payment-proof attachment.
ALTER TABLE "AccountingRecord" ADD COLUMN "facturaFileName" TEXT;
ALTER TABLE "AccountingRecord" ADD COLUMN "facturaFileUrl" TEXT;
