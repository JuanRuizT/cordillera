import { Storage } from "@google-cloud/storage"

// Reuse the bank-statements GCS bucket/credentials (the only configured bucket).
function getClient(): Storage {
  const saKeyBase64 = process.env.BANK_STATEMENTS_GCS_SA_KEY
  if (!saKeyBase64) throw new Error("BANK_STATEMENTS_GCS_SA_KEY not set")
  const credentials = JSON.parse(Buffer.from(saKeyBase64, "base64").toString("utf-8"))
  return new Storage({ credentials, projectId: process.env.BANK_STATEMENTS_GCS_PROJECT_ID })
}

function bucketName() {
  return process.env.BANK_STATEMENTS_GCS_BUCKET_NAME!
}

export async function uploadRutFile(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  const bucket = bucketName()
  const gcsPath = `ruts/${Date.now()}-${filename}`
  const file = getClient().bucket(bucket).file(gcsPath)
  await file.save(buffer, { contentType: mimeType, resumable: false })
  return `https://storage.googleapis.com/${bucket}/${gcsPath}`
}

export async function getRutSignedUrl(fileUrl: string, filename: string): Promise<string> {
  const bucket = bucketName()
  const prefix = `https://storage.googleapis.com/${bucket}/`
  const gcsPath = fileUrl.replace(prefix, "")
  const [url] = await getClient().bucket(bucket).file(gcsPath).getSignedUrl({
    action: "read",
    expires: Date.now() + 10 * 60 * 1000,
    responseDisposition: `inline; filename="${filename}"`,
  })
  return url
}

export async function deleteRutFile(fileUrl: string): Promise<void> {
  const bucket = bucketName()
  const prefix = `https://storage.googleapis.com/${bucket}/`
  const gcsPath = fileUrl.replace(prefix, "")
  await getClient().bucket(bucket).file(gcsPath).delete({ ignoreNotFound: true })
}
