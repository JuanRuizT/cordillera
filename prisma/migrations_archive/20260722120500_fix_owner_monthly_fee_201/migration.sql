-- The seed data in lib/owners.ts has a different cedula for "Apartamento 201" than what's
-- actually stored in this DB, so the cedula-keyed backfill in the previous migration missed it.
-- Fix by unit instead, which is the identifier actually used elsewhere (AccountingRecord.property).
UPDATE "Owner" SET "monthlyFee" = 300000.00 WHERE "unit" = 'Apartamento 201' AND "monthlyFee" IS NULL;
