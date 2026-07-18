import dotenv from "dotenv"
dotenv.config()

import { PrismaClient } from "../generated/prisma/client"
import { PrismaNeon } from "@prisma/adapter-neon"
import { OWNERS } from "../lib/owners"

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL!,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("Seeding owners...")
  for (const { bankAliases, ...owner } of OWNERS) {
    await prisma.owner.upsert({
      where: { cedula: owner.cedula },
      update: owner,
      create: owner,
    })
    console.log(`  ✓ ${owner.unit} — ${owner.name}`)
  }
  console.log("Done.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
