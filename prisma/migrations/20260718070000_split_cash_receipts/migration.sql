-- AlterTable: allow a CashReceipt to override the amount/concept it would
-- otherwise derive live from its AccountingRecord (null = keep deriving,
-- unchanged behavior). Also drop the 1:1 uniqueness so one AccountingRecord
-- can back several CashReceipt rows (a single payment split into several
-- receipts, e.g. two months of a fixed admin fee paid in one transfer).
ALTER TABLE "CashReceipt" ADD COLUMN "amount" DECIMAL(15,2);
ALTER TABLE "CashReceipt" ADD COLUMN "concept" TEXT;

DROP INDEX "CashReceipt_accountingRecordId_key";
