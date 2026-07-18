-- AlterTable (rename to preserve existing data)
ALTER TABLE "AccountingRecord" RENAME COLUMN "expenseVoucher" TO "expenseVoucherGenerated";

-- CreateTable
CREATE TABLE "Contractor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "idType" TEXT NOT NULL DEFAULT 'CC',
    "idNumber" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'Transferencia Bancaria',
    "bankName" TEXT,
    "bankAccount" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseVoucher" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "accountingRecordId" TEXT NOT NULL,
    "contractorId" TEXT,
    "contractorName" TEXT NOT NULL,
    "contractorIdNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "concept" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ExpenseVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_idNumber_key" ON "Contractor"("idNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseVoucher_accountingRecordId_key" ON "ExpenseVoucher"("accountingRecordId");

-- AddForeignKey
ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseVoucher" ADD CONSTRAINT "ExpenseVoucher_accountingRecordId_fkey" FOREIGN KEY ("accountingRecordId") REFERENCES "AccountingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseVoucher" ADD CONSTRAINT "ExpenseVoucher_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseVoucher" ADD CONSTRAINT "ExpenseVoucher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
