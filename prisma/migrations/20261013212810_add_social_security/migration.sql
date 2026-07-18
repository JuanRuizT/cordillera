-- AlterTable
ALTER TABLE "AccountingRecord" ADD COLUMN     "socialSecurityPaymentId" TEXT;

-- CreateTable
CREATE TABLE "SocialSecurityPayment" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'planilla',
    "period" TEXT,
    "expectedAmount" DECIMAL(15,2) NOT NULL,
    "planillaNumber" TEXT,
    "planillaTotal" DECIMAL(15,2),
    "paidDate" TIMESTAMP(3),
    "pensionAmount" DECIMAL(15,2),
    "healthAmount" DECIMAL(15,2),
    "riskAmount" DECIMAL(15,2),
    "compensationFundAmount" DECIMAL(15,2),
    "affiliateName" TEXT,
    "affiliateIdNumber" TEXT,
    "contractorId" TEXT,
    "fileName" TEXT,
    "fileUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "SocialSecurityPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialSecurityPayment_userId_kind_period_key" ON "SocialSecurityPayment"("userId", "kind", "period");

-- AddForeignKey
ALTER TABLE "AccountingRecord" ADD CONSTRAINT "AccountingRecord_socialSecurityPaymentId_fkey" FOREIGN KEY ("socialSecurityPaymentId") REFERENCES "SocialSecurityPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialSecurityPayment" ADD CONSTRAINT "SocialSecurityPayment_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialSecurityPayment" ADD CONSTRAINT "SocialSecurityPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
