-- AlterTable
ALTER TABLE "AccountingRecord" ADD COLUMN "conceptConfirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AccountingRecord" ADD COLUMN "categoryConfirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AccountingRecord" ADD COLUMN "propertyConfirmed" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: records already flagged "manual" were already reviewed/set by a human at some
-- point (or are the safe fallback when AI classification failed) — treat their existing
-- concept/category/property as confirmed so a future reclassify doesn't touch them. Records
-- still flagged "ai" are untouched AI guesses and stay unconfirmed (default false), which is
-- the whole point: they remain revisable.
UPDATE "AccountingRecord"
SET "conceptConfirmed" = true, "categoryConfirmed" = true, "propertyConfirmed" = true
WHERE "categorySource" = 'manual';
