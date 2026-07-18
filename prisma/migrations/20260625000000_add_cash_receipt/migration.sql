-- CreateTable
CREATE TABLE "CashReceipt" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "accountingRecordId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "concept" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "amountInWords" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'Efectivo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CashReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashReceipt_accountingRecordId_key" ON "CashReceipt"("accountingRecordId");

-- AddForeignKey
ALTER TABLE "CashReceipt" ADD CONSTRAINT "CashReceipt_accountingRecordId_fkey" FOREIGN KEY ("accountingRecordId") REFERENCES "AccountingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashReceipt" ADD CONSTRAINT "CashReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
