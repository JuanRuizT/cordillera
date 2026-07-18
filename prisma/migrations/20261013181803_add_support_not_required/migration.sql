-- AlterTable
ALTER TABLE "AccountingRecord" ADD COLUMN     "supportNotRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "supportNotRequiredReason" TEXT;
