-- Update embedding column to support 1536 dimensions (max for HNSW index is 2000)
ALTER TABLE "RagChunk" ALTER COLUMN "embedding" TYPE vector(1536);
