import { Storage } from "@google-cloud/storage"

// Same bucket/credentials as lib/bills/gcs.ts (the only configured bucket), under its own prefix.
function getClient(): Storage {
  const saKeyBase64 = process.env.BANK_STATEMENTS_GCS_SA_KEY
  if (!saKeyBase64) throw new Error("BANK_STATEMENTS_GCS_SA_KEY not set")
  const credentials = JSON.parse(Buffer.from(saKeyBase64, "base64").toString("utf-8"))
  return new Storage({ credentials, projectId: process.env.BANK_STATEMENTS_GCS_PROJECT_ID })
}

function bucketName() {
  return process.env.BANK_STATEMENTS_GCS_BUCKET_NAME!
}

function pathOf(fileUrl: string): string {
  return fileUrl.replace(`https://storage.googleapis.com/${bucketName()}/`, "")
}

// The planilla PDF (autoliquidación PILA) as downloaded from the operator.
export async function uploadSocialSecurityFile(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  const bucket = bucketName()
  const gcsPath = `seguridad-social/${Date.now()}-${filename}`
  await getClient().bucket(bucket).file(gcsPath).save(buffer, { contentType: mimeType, resumable: false })
  return `https://storage.googleapis.com/${bucket}/${gcsPath}`
}

export async function getSocialSecuritySignedUrl(fileUrl: string, filename: string): Promise<string> {
  const [url] = await getClient().bucket(bucketName()).file(pathOf(fileUrl)).getSignedUrl({
    action: "read",
    expires: Date.now() + 10 * 60 * 1000,
    responseDisposition: `inline; filename="${filename}"`,
  })
  return url
}

export async function deleteSocialSecurityFile(fileUrl: string): Promise<void> {
  await getClient().bucket(bucketName()).file(pathOf(fileUrl)).delete({ ignoreNotFound: true })
}
