import { Storage } from "@google-cloud/storage"

// Fixed location of the administrator signature asset in GCS. Override with env
// SIGNATURE_GCS_PATH if it ever needs to move. Replace the object to change the signature.
const SIGNATURE_GCS_PATH = process.env.SIGNATURE_GCS_PATH ?? "config/firma-administrador.png"

// Reuse the bank-statements GCS credentials/bucket (the only configured bucket).
function getClient(): Storage {
  const saKeyBase64 = process.env.BANK_STATEMENTS_GCS_SA_KEY
  if (!saKeyBase64) throw new Error("BANK_STATEMENTS_GCS_SA_KEY not set")
  const credentials = JSON.parse(Buffer.from(saKeyBase64, "base64").toString("utf-8"))
  return new Storage({ credentials, projectId: process.env.BANK_STATEMENTS_GCS_PROJECT_ID })
}

function signatureFile() {
  const bucketName = process.env.BANK_STATEMENTS_GCS_BUCKET_NAME!
  return getClient().bucket(bucketName).file(SIGNATURE_GCS_PATH)
}

// Small in-memory cache so we don't re-download the signature on every PDF.
// Tradeoff: after replacing the object, the old signature may show until the TTL expires.
const CACHE_TTL_MS = 5 * 60 * 1000
let cache: { value: string | null; at: number } | null = null

export async function getSignatureDataUrl(): Promise<string | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value
  let value: string | null = null
  try {
    const file = signatureFile()
    const [exists] = await file.exists()
    if (exists) {
      const [buffer] = await file.download()
      const [meta] = await file.getMetadata()
      const mime = meta.contentType || "image/png"
      value = `data:${mime};base64,${buffer.toString("base64")}`
    }
  } catch {
    value = null
  }
  cache = { value, at: Date.now() }
  return value
}

export async function uploadSignature(buffer: Buffer, mimeType = "image/png"): Promise<void> {
  await signatureFile().save(buffer, { contentType: mimeType, resumable: false })
  cache = null
}
