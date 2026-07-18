-- Remove snapshot columns now derived live from AccountingRecord + Owner
ALTER TABLE "CashReceipt" DROP COLUMN "recipientName";
ALTER TABLE "CashReceipt" DROP COLUMN "unit";
ALTER TABLE "CashReceipt" DROP COLUMN "date";
ALTER TABLE "CashReceipt" DROP COLUMN "concept";
ALTER TABLE "CashReceipt" DROP COLUMN "amount";
ALTER TABLE "CashReceipt" DROP COLUMN "amountInWords";
ALTER TABLE "CashReceipt" DROP COLUMN "paymentMethod";
