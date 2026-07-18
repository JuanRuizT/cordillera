import { neon } from "@neondatabase/serverless"
const sql = neon(process.env.DATABASE_URL)

const records = await sql`
  SELECT ar.id, ar.concept, ar.date, ar."userId", u.email
  FROM "AccountingRecord" ar
  JOIN "User" u ON u.id = ar."userId"
  ORDER BY ar."createdAt" DESC
  LIMIT 5
`
console.log(JSON.stringify(records, null, 2))
