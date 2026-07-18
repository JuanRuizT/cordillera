-- DropForeignKey
ALTER TABLE "RagChunk" DROP CONSTRAINT IF EXISTS "RagChunk_documentId_fkey";

-- DropForeignKey
ALTER TABLE "RagDocument" DROP CONSTRAINT IF EXISTS "RagDocument_userId_fkey";

-- DropTable
DROP TABLE IF EXISTS "RagChunk";

-- DropTable
DROP TABLE IF EXISTS "RagDocument";

-- DropExtension
DROP EXTENSION IF EXISTS vector;
