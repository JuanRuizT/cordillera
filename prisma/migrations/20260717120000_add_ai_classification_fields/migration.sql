-- AlterTable
ALTER TABLE "AccountingRecord" ADD COLUMN "categorySource" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "AccountingRecord" ADD COLUMN "categoryConfidence" DOUBLE PRECISION;
