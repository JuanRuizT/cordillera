-- CreateTable
CREATE TABLE "Factura" (
    "id" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "fileName" TEXT,
    "fileUrl" TEXT,
    "comprobanteFileName" TEXT,
    "comprobanteFileUrl" TEXT,
    "notes" TEXT,
    "accountingRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Factura_pkey" PRIMARY KEY ("id")
);

-- Backfill: preserve any AccountingRecord that already used the old single-file "factura"
-- attachment (category = 'Facturas' + facturaFileUrl set) as an already-paid Factura row.
INSERT INTO "Factura" ("id", "concept", "date", "amount", "fileName", "fileUrl", "accountingRecordId", "createdAt", "updatedAt", "userId")
SELECT gen_random_uuid()::text, ar."concept", ar."date", COALESCE(ar."expenses", 0),
       ar."facturaFileName", ar."facturaFileUrl", ar."id", ar."createdAt", ar."updatedAt", ar."userId"
FROM "AccountingRecord" ar
WHERE ar."category" = 'Facturas' AND ar."facturaFileUrl" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Factura_accountingRecordId_key" ON "Factura"("accountingRecordId");

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_accountingRecordId_fkey" FOREIGN KEY ("accountingRecordId") REFERENCES "AccountingRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
