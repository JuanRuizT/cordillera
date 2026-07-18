-- AlterTable
ALTER TABLE "Owner" ADD COLUMN "monthlyFee" DECIMAL(15,2);

-- Precarga inferida a partir del área/coeficiente de cada unidad (ver lib/owners.ts) y de las
-- constantes de clasificación en lib/accounting/classification-context.ts. Editable desde la
-- vista de Paz y Salvo si el valor real es distinto.
UPDATE "Owner" SET "monthlyFee" = 400000.00 WHERE "cedula" = '10243903'; -- Apartamento 101 (más grande)
UPDATE "Owner" SET "monthlyFee" = 300000.00 WHERE "cedula" = '1053791953'; -- Apartamento 201
UPDATE "Owner" SET "monthlyFee" = 300000.00 WHERE "cedula" = '24325068'; -- Apartamento 301
UPDATE "Owner" SET "monthlyFee" = 300000.00 WHERE "cedula" = '10228342'; -- Apartamento 401
UPDATE "Owner" SET "monthlyFee" = 50000.00 WHERE "cedula" = '30326504'; -- Local Comercial
