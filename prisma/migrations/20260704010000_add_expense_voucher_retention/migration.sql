-- Optional withholding tax (retención en la fuente) rate applied to an expense voucher.
-- Amounts (retention amount, gross total) are always derived live, never stored.
ALTER TABLE "ExpenseVoucher" ADD COLUMN "retentionRate" DECIMAL(5,2);
