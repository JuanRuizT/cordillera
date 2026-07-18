-- DropForeignKey
ALTER TABLE "AccountingRecord" DROP CONSTRAINT "AccountingRecord_invoiceId_fkey";

-- AlterTable
ALTER TABLE "AccountingRecord" DROP COLUMN "invoiceId";

-- CreateTable
CREATE TABLE "Abono" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "accountingRecordId" TEXT,
    "date" TIMESTAMP(3),
    "amount" DECIMAL(15,2),
    "concept" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Abono_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Abono_accountingRecordId_key" ON "Abono"("accountingRecordId");

-- AddForeignKey
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_accountingRecordId_fkey" FOREIGN KEY ("accountingRecordId") REFERENCES "AccountingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraint: un Abono manual (sin accountingRecordId) debe traer sus propios datos.
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_manual_fields_check"
  CHECK ("accountingRecordId" IS NOT NULL OR ("date" IS NOT NULL AND "amount" IS NOT NULL AND "concept" IS NOT NULL));
