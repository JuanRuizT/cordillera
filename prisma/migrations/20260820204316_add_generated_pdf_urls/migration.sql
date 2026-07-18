-- AlterTable
ALTER TABLE "CashReceipt" ADD COLUMN     "pdfFileUrl" TEXT,
ADD COLUMN     "pdfUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ExpenseVoucher" ADD COLUMN     "pdfFileUrl" TEXT,
ADD COLUMN     "pdfUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "generatedPdfFileUrl" TEXT,
ADD COLUMN     "generatedPdfUpdatedAt" TIMESTAMP(3);
