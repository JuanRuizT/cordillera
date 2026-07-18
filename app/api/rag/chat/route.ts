import { auth } from "@/auth"
import { google } from "@ai-sdk/google"
import { streamText } from "ai"
import { embedQuery } from "@/lib/rag/embeddings"
import { searchSimilarChunks } from "@/lib/rag/vector-search"
import { getSignedUrl } from "@/lib/rag/gcs"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { messages } = await req.json()
  const lastMessage = messages[messages.length - 1]?.content
  if (!lastMessage) {
    return NextResponse.json({ error: "No message provided" }, { status: 400 })
  }

  // Embed the query
  const queryEmbedding = await embedQuery(lastMessage)

  // Search for similar chunks
  const chunks = await searchSimilarChunks(queryEmbedding, 5)

  // Get signed URLs for source documents
  const sources = await Promise.all(
    chunks.map(async (chunk) => ({
      id: chunk.id,
      documentId: chunk.documentId,
      name: chunk.name,
      mimeType: chunk.mimeType,
      pageNumber: chunk.pageNumber,
      content: chunk.content.slice(0, 300),
      similarity: chunk.similarity,
      signedUrl: await getSignedUrl(chunk.gcsPath, 120),
    }))
  )

  // Build context string
  const context =
    chunks.length > 0
      ? chunks
          .map(
            (c, i) =>
              `[Source ${i + 1} - "${c.name}"${c.pageNumber ? `, page ${c.pageNumber}` : ""}]:\n${c.content}`
          )
          .join("\n\n---\n\n")
      : "No relevant information found in the available documents."

  const result = streamText({
    model: google("gemini-3-flash-preview"),
    system: `You are an expert assistant who answers questions based on knowledge documents.
When using information from the documents, cite the source using [Source N].
If the information is not in the documents, state it clearly.
Always answer in the language of the user's question.`,
    messages: [
      ...messages.slice(0, -1),
      {
        role: "user",
        content: `Document context:\n\n${context}\n\n---\n\nQuestion: ${lastMessage}`,
      },
    ],
  })

  const response = result.toTextStreamResponse()

  // Attach sources as a header so the client can display references
  // Base64 encode to handle Unicode characters in content
  const headers = new Headers(response.headers)
  const sourcesBase64 = Buffer.from(JSON.stringify(sources), 'utf-8').toString('base64')
  headers.set("X-Rag-Sources", sourcesBase64)
  headers.set("Access-Control-Expose-Headers", "X-Rag-Sources")

  return new Response(response.body, {
    status: response.status,
    headers,
  })
}
