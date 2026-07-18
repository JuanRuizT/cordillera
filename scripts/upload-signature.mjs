// One-time upload of the administrator signature to GCS.
// Usage: node scripts/upload-signature.mjs [path-to-image]
// Default source: ./Firma.PNG  |  Destination: config/firma-administrador.png
import "dotenv/config"
import { readFileSync } from "node:fs"
import { Storage } from "@google-cloud/storage"

const SIGNATURE_GCS_PATH = process.env.SIGNATURE_GCS_PATH ?? "config/firma-administrador.png"
const SOURCE = process.argv[2] ?? "Firma.PNG"

function getClient() {
  const saKeyBase64 = process.env.BANK_STATEMENTS_GCS_SA_KEY
  if (!saKeyBase64) throw new Error("BANK_STATEMENTS_GCS_SA_KEY not set")
  const credentials = JSON.parse(Buffer.from(saKeyBase64, "base64").toString("utf-8"))
  return new Storage({ credentials, projectId: process.env.BANK_STATEMENTS_GCS_PROJECT_ID })
}

const buffer = readFileSync(SOURCE)
const bucketName = process.env.BANK_STATEMENTS_GCS_BUCKET_NAME
const file = getClient().bucket(bucketName).file(SIGNATURE_GCS_PATH)

await file.save(buffer, { contentType: "image/png", resumable: false })
const [exists] = await file.exists()
const [meta] = await file.getMetadata()
console.log(`Uploaded ${SOURCE} -> gs://${bucketName}/${SIGNATURE_GCS_PATH}`)
console.log(`  exists: ${exists} | size: ${meta.size} bytes | contentType: ${meta.contentType}`)
