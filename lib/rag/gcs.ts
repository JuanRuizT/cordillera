import { Storage } from "@google-cloud/storage"

function getGcsClient(): Storage {
  const saKeyBase64 = process.env.GOOGLE_CLOUD_SA_KEY
  if (!saKeyBase64) {
    throw new Error("GOOGLE_CLOUD_SA_KEY env var not set")
  }
  const credentials = JSON.parse(Buffer.from(saKeyBase64, "base64").toString("utf-8"))
  return new Storage({ credentials, projectId: process.env.GOOGLE_CLOUD_PROJECT_ID })
}

export async function uploadToGcs(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  const storage = getGcsClient()
  const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET_NAME!)
  const gcsPath = `rag-documents/${Date.now()}-${filename}`
  const file = bucket.file(gcsPath)
  await file.save(buffer, { contentType: mimeType, resumable: false })
  return gcsPath
}

export async function getSignedUrl(gcsPath: string, expiresMinutes = 60): Promise<string> {
  const storage = getGcsClient()
  const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET_NAME!)
  const file = bucket.file(gcsPath)
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + expiresMinutes * 60 * 1000,
  })
  return url
}

export async function deleteFromGcs(gcsPath: string): Promise<void> {
  const storage = getGcsClient()
  const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET_NAME!)
  await bucket.file(gcsPath).delete({ ignoreNotFound: true })
}
