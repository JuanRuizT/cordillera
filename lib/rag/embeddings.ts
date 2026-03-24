import { google, type GoogleEmbeddingModelOptions } from "@ai-sdk/google"
import { embed } from "ai"

const embeddingModel = google.embedding("gemini-embedding-001")

export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
    providerOptions: {
      google: {
        outputDimensionality: 1536,
        taskType: "RETRIEVAL_DOCUMENT",
      } satisfies GoogleEmbeddingModelOptions,
    },
  })
  return embedding
}

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
    providerOptions: {
      google: {
        outputDimensionality: 1536,
        taskType: "RETRIEVAL_QUERY",
      } satisfies GoogleEmbeddingModelOptions,
    },
  })
  return embedding
}
