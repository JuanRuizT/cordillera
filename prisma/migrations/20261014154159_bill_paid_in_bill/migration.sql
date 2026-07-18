-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "paidInBillId" TEXT;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_paidInBillId_fkey" FOREIGN KEY ("paidInBillId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
