-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."Abono" (
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

-- CreateTable
CREATE TABLE "public"."Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "public"."AccountingRecord" (
    "id" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "income" DECIMAL(15,2),
    "expenses" DECIMAL(15,2),
    "category" TEXT,
    "property" TEXT,
    "cashReceiptGenerated" BOOLEAN NOT NULL DEFAULT false,
    "expenseVoucherGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "bankStatementId" TEXT,
    "bankMovementId" TEXT,
    "categorySource" TEXT NOT NULL DEFAULT 'manual',
    "categoryConfidence" DOUBLE PRECISION,
    "accountId" TEXT,
    "conceptConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "categoryConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "propertyConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "facturaFileName" TEXT,
    "facturaFileUrl" TEXT,
    "parentRecordId" TEXT,

    CONSTRAINT "AccountingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AiCallLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "estimatedCostUsd" DECIMAL(12,6),
    "itemCount" INTEGER,
    "durationMs" INTEGER,
    "bankStatementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BankMovement" (
    "id" TEXT NOT NULL,
    "bankStatementId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "branch" TEXT,
    "document" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "balance" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BankStatement" (
    "id" TEXT NOT NULL,
    "client" TEXT,
    "address" TEXT,
    "city" TEXT,
    "accountType" TEXT,
    "accountNumber" TEXT,
    "branch" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "previousBalance" DECIMAL(15,2),
    "totalCredits" DECIMAL(15,2),
    "totalDebits" DECIMAL(15,2),
    "currentBalance" DECIMAL(15,2),
    "averageBalance" DECIMAL(15,2),
    "interest" DECIMAL(15,2),
    "taxWithholding" DECIMAL(15,2),
    "fileName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "fileUrl" TEXT,

    CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CashReceipt" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "accountingRecordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(15,2),
    "concept" TEXT,

    CONSTRAINT "CashReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Contractor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "idType" TEXT NOT NULL DEFAULT 'CC',
    "idNumber" TEXT NOT NULL,
    "bankName" TEXT,
    "bankAccount" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "bankAccountType" TEXT,
    "rutFileName" TEXT,
    "rutFileUrl" TEXT,

    CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExpenseVoucher" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "accountingRecordId" TEXT NOT NULL,
    "contractorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ExpenseVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FinancialAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'cash',
    "bankAccountNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Invoice" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "concept" TEXT NOT NULL,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "fileName" TEXT,
    "fileUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "number" INTEGER,
    "retentionRate" DECIMAL(5,2),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Owner" (
    "id" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "aptArea" DOUBLE PRECISION NOT NULL,
    "aptCoefficient" DOUBLE PRECISION NOT NULL,
    "garageArea" DOUBLE PRECISION NOT NULL,
    "garageCoefficient" DOUBLE PRECISION NOT NULL,
    "totalCoefficient" DOUBLE PRECISION NOT NULL,
    "name" TEXT NOT NULL,
    "cedula" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "monthlyFee" DECIMAL(15,2),

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PaymentProof" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountingRecordId" TEXT NOT NULL,

    CONSTRAINT "PaymentProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Todo" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "Todo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Abono_accountingRecordId_key" ON "public"."Abono"("accountingRecordId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingRecord_bankMovementId_key" ON "public"."AccountingRecord"("bankMovementId" ASC);

-- CreateIndex
CREATE INDEX "AiCallLog_userId_createdAt_idx" ON "public"."AiCallLog"("userId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_idNumber_key" ON "public"."Contractor"("idNumber" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseVoucher_accountingRecordId_key" ON "public"."ExpenseVoucher"("accountingRecordId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_bankAccountNumber_key" ON "public"."FinancialAccount"("bankAccountNumber" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Owner_cedula_key" ON "public"."Owner"("cedula" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Owner_unit_key" ON "public"."Owner"("unit" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email" ASC);

-- AddForeignKey
ALTER TABLE "public"."Abono" ADD CONSTRAINT "Abono_accountingRecordId_fkey" FOREIGN KEY ("accountingRecordId") REFERENCES "public"."AccountingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Abono" ADD CONSTRAINT "Abono_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Abono" ADD CONSTRAINT "Abono_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccountingRecord" ADD CONSTRAINT "AccountingRecord_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccountingRecord" ADD CONSTRAINT "AccountingRecord_bankMovementId_fkey" FOREIGN KEY ("bankMovementId") REFERENCES "public"."BankMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccountingRecord" ADD CONSTRAINT "AccountingRecord_bankStatementId_fkey" FOREIGN KEY ("bankStatementId") REFERENCES "public"."BankStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccountingRecord" ADD CONSTRAINT "AccountingRecord_parentRecordId_fkey" FOREIGN KEY ("parentRecordId") REFERENCES "public"."AccountingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccountingRecord" ADD CONSTRAINT "AccountingRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AiCallLog" ADD CONSTRAINT "AiCallLog_bankStatementId_fkey" FOREIGN KEY ("bankStatementId") REFERENCES "public"."BankStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AiCallLog" ADD CONSTRAINT "AiCallLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BankMovement" ADD CONSTRAINT "BankMovement_bankStatementId_fkey" FOREIGN KEY ("bankStatementId") REFERENCES "public"."BankStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BankStatement" ADD CONSTRAINT "BankStatement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CashReceipt" ADD CONSTRAINT "CashReceipt_accountingRecordId_fkey" FOREIGN KEY ("accountingRecordId") REFERENCES "public"."AccountingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CashReceipt" ADD CONSTRAINT "CashReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Contractor" ADD CONSTRAINT "Contractor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExpenseVoucher" ADD CONSTRAINT "ExpenseVoucher_accountingRecordId_fkey" FOREIGN KEY ("accountingRecordId") REFERENCES "public"."AccountingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExpenseVoucher" ADD CONSTRAINT "ExpenseVoucher_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "public"."Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExpenseVoucher" ADD CONSTRAINT "ExpenseVoucher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FinancialAccount" ADD CONSTRAINT "FinancialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "public"."Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentProof" ADD CONSTRAINT "PaymentProof_accountingRecordId_fkey" FOREIGN KEY ("accountingRecordId") REFERENCES "public"."AccountingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Todo" ADD CONSTRAINT "Todo_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
