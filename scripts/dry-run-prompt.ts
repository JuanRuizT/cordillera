// Dry-run of the classification prompt: renders exactly what classifyMovements would send to the
// model for a given set of movements, without making the LLM call. Diagnostic only.
import dotenv from "dotenv"
dotenv.config()

import { prisma } from "../lib/db"
import { ACCOUNTING_CATEGORIES } from "../lib/accounting/categories"
import { buildSystemPrompt, ALL_PAYER_ALIASES } from "../lib/accounting/classification-context"

function normalizeDescription(desc: string): string {
  return desc.toUpperCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim()
}

const MAX_FEWSHOT_EXAMPLES = 60
const MAX_EXAMPLES_PER_DESCRIPTION = 4

async function main() {
  const user = await prisma.user.findFirstOrThrow({ where: { accountingRecords: { some: {} } } })

  const owners = await prisma.owner.findMany({
    select: { unit: true, name: true, monthlyFee: true },
    orderBy: { unit: "asc" },
  })

  // Mirrors getHistoricalFeeAmounts(): leaves only, so a lump payment's parent (a sum of several
  // months) is not mistaken for a monthly rate.
  const feeRows = await prisma.accountingRecord.findMany({
    where: {
      userId: user.id,
      category: "Pago Administración",
      property: { not: null },
      income: { not: null },
      childRecords: { none: {} },
    },
    select: { property: true, income: true },
  })
  const feesByUnit = new Map<string, Set<number>>()
  for (const r of feeRows) {
    const set = feesByUnit.get(r.property!) ?? new Set<number>()
    set.add(Number(r.income))
    feesByUnit.set(r.property!, set)
  }

  const system = buildSystemPrompt(
    ACCOUNTING_CATEGORIES,
    owners.map((o) => ({
      unit: o.unit,
      name: o.name,
      monthlyFee: o.monthlyFee != null ? Number(o.monthlyFee) : null,
      historicalFeeAmounts: [...(feesByUnit.get(o.unit) ?? [])].sort((a, b) => a - b),
    }))
  )

  // Same shape as getFewShotExamples, but excluding August so we reproduce the import conditions.
  const history = await prisma.accountingRecord.findMany({
    where: { userId: user.id, category: { not: null }, bankMovementId: { not: null }, date: { lt: new Date("2026-08-01") } },
    select: {
      concept: true, category: true, property: true, income: true, expenses: true,
      bankMovement: { select: { description: true } },
    },
    orderBy: { date: "desc" },
    take: 1000,
  })

  const groups = new Map<string, typeof history>()
  for (const r of history) {
    const key = normalizeDescription(r.bankMovement?.description ?? r.concept)
    const g = groups.get(key)
    if (g) g.push(r)
    else groups.set(key, [r])
  }

  const propertyAmbiguous = new Set<string>()
  const examples: { description: string; concept: string; category: string; property: string | null; amount: number; ambiguous: boolean }[] = []

  for (const [key, rows] of groups) {
    if (new Set(rows.map((r) => r.property ?? "null")).size > 1) propertyAmbiguous.add(key)
    const byVariant = new Map<string, (typeof rows)[number]>()
    for (const r of rows) {
      const variant = `${r.category}|${r.property ?? "null"}`
      if (!byVariant.has(variant)) byVariant.set(variant, r)
      if (byVariant.size >= MAX_EXAMPLES_PER_DESCRIPTION) break
    }
    const ambiguous = byVariant.size > 1
    for (const r of byVariant.values()) {
      examples.push({
        description: r.bankMovement?.description ?? r.concept,
        concept: r.concept,
        category: r.category!,
        property: r.property,
        amount: r.income != null ? Number(r.income) : -Number(r.expenses ?? 0),
        ambiguous,
      })
    }
    if (examples.length >= MAX_FEWSHOT_EXAMPLES) break
  }

  console.log("=".repeat(100))
  console.log("SYSTEM PROMPT")
  console.log("=".repeat(100))
  console.log(system)

  console.log("\n" + "=".repeat(100))
  console.log(`EJEMPLOS HISTORICOS (${examples.length}, antes eran 24)`)
  console.log("=".repeat(100))
  for (const e of examples) {
    const amount = `${e.amount >= 0 ? "+" : ""}${e.amount}`
    console.log(`- "${e.description}" amount=${amount} -> concept="${e.concept}", category="${e.category}", property="${e.property ?? "null"}"${e.ambiguous ? "  [DESCRIPCION AMBIGUA]" : ""}`)
  }

  console.log("\n" + "=".repeat(100))
  console.log("DESCRIPCIONES AMBIGUAS EN PROPIEDAD (el guard server-side actua sobre estas)")
  console.log("=".repeat(100))
  for (const d of propertyAmbiguous) {
    const anon = !ALL_PAYER_ALIASES.some((a) => d.toUpperCase().includes(a))
    console.log(`- "${d}"  ${anon ? "<-- ANONIMA: property forzada a null" : "(nombra un pagador, se respeta)"}`)
  }
}

main()
  .catch((e) => {
    console.error("FALLO:", e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
