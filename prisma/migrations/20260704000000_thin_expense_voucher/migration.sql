-- Remove snapshot columns now derived live from AccountingRecord + Contractor
ALTER TABLE "ExpenseVoucher" DROP COLUMN "contractorName";
ALTER TABLE "ExpenseVoucher" DROP COLUMN "contractorIdNumber";
ALTER TABLE "ExpenseVoucher" DROP COLUMN "date";
ALTER TABLE "ExpenseVoucher" DROP COLUMN "concept";
ALTER TABLE "ExpenseVoucher" DROP COLUMN "amount";
ALTER TABLE "ExpenseVoucher" DROP COLUMN "paymentMethod";
