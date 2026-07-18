-- Retención en la fuente belongs to the Cuenta de Cobro (Invoice) total, not to each
-- individual Comprobante de Egreso payment.
ALTER TABLE "ExpenseVoucher" DROP COLUMN "retentionRate";

ALTER TABLE "Invoice" ADD COLUMN "number" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "retentionRate" DECIMAL(5,2);
