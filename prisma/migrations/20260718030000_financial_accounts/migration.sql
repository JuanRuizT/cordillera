-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'cash',
    "bankAccountNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_bankAccountNumber_key" ON "FinancialAccount"("bankAccountNumber");

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: create one FinancialAccount per distinct (userId, account) pair from the
-- existing free-text AccountingRecord.account values, before that column is dropped.
INSERT INTO "FinancialAccount" ("id", "name", "type", "bankAccountNumber", "updatedAt", "userId")
SELECT
  gen_random_uuid()::text,
  t."account",
  CASE WHEN lower(t."account") = 'efectivo' THEN 'cash' ELSE 'bank' END,
  CASE WHEN lower(t."account") = 'efectivo' THEN NULL ELSE t."account" END,
  CURRENT_TIMESTAMP,
  t."userId"
FROM (SELECT DISTINCT "account", "userId" FROM "AccountingRecord" WHERE "account" IS NOT NULL) t
ON CONFLICT ("bankAccountNumber") DO NOTHING;

-- AlterTable
ALTER TABLE "AccountingRecord" ADD COLUMN "accountId" TEXT;

-- Backfill: rewire each record to the FinancialAccount that matches its old free-text value.
UPDATE "AccountingRecord" ar
SET "accountId" = fa."id"
FROM "FinancialAccount" fa
WHERE fa."userId" = ar."userId" AND fa."name" = ar."account";

-- AddForeignKey
ALTER TABLE "AccountingRecord" ADD CONSTRAINT "AccountingRecord_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "AccountingRecord" DROP COLUMN "account";
