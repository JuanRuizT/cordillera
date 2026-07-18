-- CreateTable
CREATE TABLE "OwnerFee" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "fromMonth" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerFee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnerFee_ownerId_fromMonth_key" ON "OwnerFee"("ownerId", "fromMonth");

-- AddForeignKey
ALTER TABLE "OwnerFee" ADD CONSTRAINT "OwnerFee_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Fee history preload (decided 2026-09-15). Apartments paid $300.000 until March 2026 and $400.000
-- from April 2026. 301's first charged month is November 2025: October was settled before these
-- records began. 101 keeps its current $400.000 from October 2025 until its earlier fee is confirmed.
INSERT INTO "OwnerFee" ("id", "ownerId", "fromMonth", "amount", "updatedAt")
SELECT gen_random_uuid()::text, o."id", v."fromMonth", v."amount", CURRENT_TIMESTAMP
FROM (VALUES
  ('Apartamento 101', '2025-10', 400000.00),
  ('Apartamento 201', '2025-10', 300000.00),
  ('Apartamento 201', '2026-04', 400000.00),
  ('Apartamento 301', '2025-11', 300000.00),
  ('Apartamento 301', '2026-04', 400000.00),
  ('Apartamento 401', '2025-10', 300000.00),
  ('Apartamento 401', '2026-04', 400000.00),
  ('Local Comercial', '2025-10', 50000.00)
) AS v("unit", "fromMonth", "amount")
JOIN "Owner" o ON o."unit" = v."unit";
