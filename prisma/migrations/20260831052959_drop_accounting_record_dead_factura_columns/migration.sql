-- Drop the old single-file "factura" attachment columns on AccountingRecord — dead since the
-- attachment mechanism was replaced by the standalone Bill model (see migration
-- 20260831020959_add_factura, later renamed to Bill in 20260831052302_rename_factura_to_bill).
-- Verified beforehand that every row with data here already has a matching Bill row with the
-- same fileUrl (created by that earlier migration's backfill), so nothing is lost.
ALTER TABLE "AccountingRecord" DROP COLUMN "facturaFileName";
ALTER TABLE "AccountingRecord" DROP COLUMN "facturaFileUrl";
