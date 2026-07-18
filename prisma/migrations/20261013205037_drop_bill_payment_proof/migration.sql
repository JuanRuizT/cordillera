/*
  Warnings:

  - You are about to drop the column `paymentProofFileName` on the `Bill` table. All the data in the column will be lost.
  - You are about to drop the column `paymentProofFileUrl` on the `Bill` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Bill" DROP COLUMN "paymentProofFileName",
DROP COLUMN "paymentProofFileUrl";
