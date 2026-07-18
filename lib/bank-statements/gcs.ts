import { Storage } from "@google-cloud/storage"

function getClient(): Storage {
  const saKeyBase64 = process.env.BANK_STATEMENTS_GCS_SA_KEY
  if (!saKeyBase64) throw new Error("BANK_STATEMENTS_GCS_SA_KEY not set")
  const credentials = JSON.parse(Buffer.from(saKeyBase64, "base64").toString("utf-8"))
  return new Storage({ credentials, projectId: process.env.BANK_STATEMENTS_GCS_PROJECT_ID })
}

export async function uploadStatementFile(buffer: Buffer, filename: string): Promise<string> {
  const storage = getClient()
  const bucketName = process.env.BANK_STATEMENTS_GCS_BUCKET_NAME!
  const gcsPath = `statements/${Date.now()}-${filename}`
  const file = storage.bucket(bucketName).file(gcsPath)
  await file.save(buffer, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    resumable: false,
  })
  return `https://storage.googleapis.com/${bucketName}/${gcsPath}`
}

export async function getSignedDownloadUrl(fileUrl: string, filename: string): Promise<string> {
  const bucketName = process.env.BANK_STATEMENTS_GCS_BUCKET_NAME!
  const prefix = `https://storage.googleapis.com/${bucketName}/`
  const gcsPath = fileUrl.replace(prefix, "")
  const storage = getClient()
  const [url] = await storage.bucket(bucketName).file(gcsPath).getSignedUrl({
    action: "read",
    expires: Date.now() + 10 * 60 * 1000,
    responseDisposition: `attachment; filename="${filename}"`,
  })
  return url
}

export async function downloadStatementBuffer(fileUrl: string): Promise<Buffer> {
  const bucketName = process.env.BANK_STATEMENTS_GCS_BUCKET_NAME!
  const prefix = `https://storage.googleapis.com/${bucketName}/`
  const gcsPath = fileUrl.replace(prefix, "")
  const storage = getClient()
  const [contents] = await storage.bucket(bucketName).file(gcsPath).download()
  return contents
}

export async function deleteStatementFile(fileUrl: string): Promise<void> {
  const bucketName = process.env.BANK_STATEMENTS_GCS_BUCKET_NAME!
  const prefix = `https://storage.googleapis.com/${bucketName}/`
  const gcsPath = fileUrl.replace(prefix, "")
  const storage = getClient()
  await storage.bucket(bucketName).file(gcsPath).delete({ ignoreNotFound: true })
}
