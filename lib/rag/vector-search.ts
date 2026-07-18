import { prisma } from "@/lib/db"

export interface ChunkSearchResult {
  id: string
  content: string
  pageNumber: number | null
  documentId: string
  name: string
  gcsPath: string
  mimeType: string
  similarity: number
}

export async function searchSimilarChunks(
  queryEmbedding: number[],
  limit = 5
): Promise<ChunkSearchResult[]> {
  const vector = `[${queryEmbedding.join(",")}]`
  const results = await prisma.$queryRaw<ChunkSearchResult[]>`
    SELECT
      rc.id,
      rc.content,
      rc."pageNumber",
      rc."documentId",
      rd.name,
      rd."gcsPath",
      rd."mimeType",
      (1 - (rc.embedding <=> ${vector}::vector))::float AS similarity
    FROM "RagChunk" rc
    JOIN "RagDocument" rd ON rc."documentId" = rd.id
    WHERE rd.status = 'ready'
      AND rc.embedding IS NOT NULL
    ORDER BY rc.embedding <=> ${vector}::vector
    LIMIT ${limit}
  `
  return results
}
