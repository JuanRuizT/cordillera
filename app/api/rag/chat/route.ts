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
              `[Fuente ${i + 1} - "${c.name}"${c.pageNumber ? `, página ${c.pageNumber}` : ""}]:\n${c.content}`
          )
          .join("\n\n---\n\n")
      : "No se encontró información relevante en los documentos disponibles."

  const result = streamText({
    model: google("gemini-3-flash-preview"),
    system: `Eres un asistente experto que responde preguntas basándote en documentos de conocimiento.
Cuando uses información de los documentos, cita la fuente usando [Fuente N].
Si la información no está en los documentos, indícalo claramente.
Responde siempre en el idioma de la pregunta del usuario.`,
    messages: [
      ...messages.slice(0, -1),
      {
        role: "user",
        content: `Contexto de los documentos:\n\n${context}\n\n---\n\nPregunta: ${lastMessage}`,
      },
    ],
  })

  const response = result.toTextStreamResponse()

  // Attach sources as a header so the client can display references
  const headers = new Headers(response.headers)
  headers.set("X-Rag-Sources", JSON.stringify(sources))
  headers.set("Access-Control-Expose-Headers", "X-Rag-Sources")

  return new Response(response.body, {
    status: response.status,
    headers,
  })
}
