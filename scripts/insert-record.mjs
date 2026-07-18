import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL)

const [user] = await sql`SELECT id FROM "User" WHERE email = 'juanruizt89@gmail.com'`
if (!user) throw new Error("User not found")

await sql`
  INSERT INTO "AccountingRecord" (id, concept, date, income, expenses, category, property, "cashReceiptGenerated", "expenseVoucher", "userId", "createdAt", "updatedAt")
  VALUES (
    gen_random_uuid()::text,
    'Entrega de Administracion de Don Danilo',
    '2024-10-01',
    780265.00,
    NULL,
    'Inicio',
    NULL,
    false,
    false,
    ${user.id},
    NOW(),
    NOW()
  )
`

console.log("Record inserted for userId:", user.id)
