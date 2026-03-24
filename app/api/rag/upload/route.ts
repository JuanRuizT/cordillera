import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { uploadToGcs } from "@/lib/rag/gcs"
import { extractPdfPages, getPdfPageCount } from "@/lib/rag/pdf-processor"
import { embedText } from "@/lib/rag/embeddings"
import { google } from "@ai-sdk/google"
import { generateText } from "ai"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
  }

  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

  const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Upload to GCS
  let gcsPath: string
  try {
    gcsPath = await uploadToGcs(buffer, file.name, file.type)
  } catch (err) {
    console.error("GCS upload error:", err)
    return NextResponse.json({ error: "Failed to upload file to storage" }, { status: 500 })
  }

  // Create document record
  const document = await prisma.ragDocument.create({
    data: {
      name: file.name.replace(/\.[^/.]+$/, ""),
      originalName: file.name,
      gcsPath,
      mimeType: file.type,
      status: "processing",
      userId: user.id,
      updatedAt: new Date(),
    },
  })

  try {
    const isPdf = file.type === "application/pdf"
    let pages: { pageNumber: number | null; text: string }[] = []

    if (isPdf) {
      const extracted = await extractPdfPages(buffer)
      pages = extracted
      const pageCount = await getPdfPageCount(buffer)
      await prisma.ragDocument.update({
        where: { id: document.id },
        data: { pageCount },
      })
    } else {
      // For images, use Gemini Vision to extract text/description
      const base64 = buffer.toString("base64")
      const { text } = await generateText({
        model: google("gemini-3-flash-preview"),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                image: base64,
                mediaType: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              },
              {
                type: "text",
                text: "Describe and transcribe all the text and content visible in this image in detail. Include all text, labels, diagrams, and relevant visual information.",
              },
            ],
          },
        ],
      })
      pages = [{ pageNumber: null, text }]
    }

    // Embed each page and insert chunks
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i]
      if (!page.text || page.text.trim().length < 10) continue

      const embedding = await embedText(page.text)
      const vector = `[${embedding.join(",")}]`

      // Use raw SQL to insert with vector column
      await prisma.$executeRaw`
        INSERT INTO "RagChunk" ("id", "documentId", "content", "pageNumber", "chunkIndex", "createdAt", "embedding")
        VALUES (
          gen_random_uuid()::text,
          ${document.id},
          ${page.text},
          ${page.pageNumber},
          ${i},
          NOW(),
          ${vector}::vector
        )
      `
    }

    // Mark as ready
    const updated = await prisma.ragDocument.update({
      where: { id: document.id },
      data: { status: "ready" },
    })

    return NextResponse.json({ document: updated })
  } catch (err) {
    console.error("Processing error:", err)
    await prisma.ragDocument.update({
      where: { id: document.id },
      data: { status: "error", errorMessage: String(err) },
    })
    return NextResponse.json({ error: "Processing failed", document }, { status: 500 })
  }
}
