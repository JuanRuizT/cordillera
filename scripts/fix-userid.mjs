import { neon } from "@neondatabase/serverless"
const sql = neon(process.env.DATABASE_URL)

await sql`
  UPDATE "AccountingRecord"
  SET "userId" = 'cmpon6u020000g0c6x6bivf5w'
  WHERE id = '4e1e02b3-8b78-4731-a5f5-b3b211d8cbe5'
`
console.log("userId corrected")
