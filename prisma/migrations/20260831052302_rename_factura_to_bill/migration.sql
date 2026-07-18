-- Rename the Factura table (and its comprobante columns) to English identifiers, matching the
-- rest of the schema's naming convention (Invoice, Contractor, PaymentProof, ...). Hand-written
-- with RENAME statements (not a generated drop/create) to preserve the existing rows losslessly —
-- see memory "prisma-migration-drift-safety".

ALTER TABLE "Factura" RENAME TO "Bill";
ALTER TABLE "Bill" RENAME COLUMN "comprobanteFileName" TO "paymentProofFileName";
ALTER TABLE "Bill" RENAME COLUMN "comprobanteFileUrl" TO "paymentProofFileUrl";

ALTER TABLE "Bill" RENAME CONSTRAINT "Factura_pkey" TO "Bill_pkey";
ALTER TABLE "Bill" RENAME CONSTRAINT "Factura_accountingRecordId_fkey" TO "Bill_accountingRecordId_fkey";
ALTER TABLE "Bill" RENAME CONSTRAINT "Factura_userId_fkey" TO "Bill_userId_fkey";
ALTER INDEX "Factura_accountingRecordId_key" RENAME TO "Bill_accountingRecordId_key";
