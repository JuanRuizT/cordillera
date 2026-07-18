import { z } from "zod"
import { google } from "@ai-sdk/google"
import { prisma } from "@/lib/db"
import { trackedGenerateObject } from "@/lib/ai/tracked-generate-object"
import { ACCOUNTING_CATEGORIES } from "./categories"
import { buildSystemPrompt } from "./classification-context"

export const AI_REVIEW_THRESHOLD = 0.7
const MAX_FEWSHOT_EXAMPLES = 40
const CLASSIFY_TIMEOUT_MS = 25_000

const ClassificationItemSchema = z.object({
  bankMovementId: z.string(),
  concept: z.string().min(1),
  category: z.string().nullable(),
  property: z.string().nullable(),
  confidence: z.number().min(0).max(1),
})

const ClassificationBatchSchema = z.object({
  results: z.array(ClassificationItemSchema),
})

export type ClassificationItem = z.infer<typeof ClassificationItemSchema>

export interface MovementToClassify {
  bankMovementId: string
  description: string
  date: Date
  amount: number // signed: positive = income, negative = expense
  // Already-known values (e.g. from a manual edit before reclassifying) — used as strong
  // context so the model can infer missing fields from them, never sent to overwrite them.
  currentConcept?: string
  currentCategory?: string | null
  currentProperty?: string | null
}

export interface ClassifyResult {
  ok: boolean
  items: Map<string, ClassificationItem>
  error?: string
}

function normalizeDescription(desc: string): string {
  return desc.toUpperCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim()
}

async function getFewShotExamples(userId: string) {
  const history = await prisma.accountingRecord.findMany({
    where: { userId, category: { not: null }, bankMovementId: { not: null } },
    select: {
      concept: true,
      category: true,
      property: true,
      bankMovement: { select: { description: true } },
    },
    orderBy: { date: "desc" },
    take: 1000,
  })

  const seen = new Set<string>()
  const examples: { description: string; concept: string; category: string; property: string | null }[] = []

  for (const r of history) {
    const rawDesc = r.bankMovement?.description ?? r.concept
    const key = normalizeDescription(rawDesc)
    if (seen.has(key)) continue
    seen.add(key)
    examples.push({ description: rawDesc, concept: r.concept, category: r.category!, property: r.property })
    if (examples.length >= MAX_FEWSHOT_EXAMPLES) break
  }

  return examples
}

export async function classifyMovements(
  movements: MovementToClassify[],
  opts: { userId: string; bankStatementId?: string }
): Promise<ClassifyResult> {
  if (movements.length === 0) return { ok: true, items: new Map() }

  try {
    const [owners, examples] = await Promise.all([
      prisma.owner.findMany({ select: { unit: true }, orderBy: { unit: "asc" } }),
      getFewShotExamples(opts.userId),
    ])
    const validUnits = owners.map((o) => o.unit)
    const system = buildSystemPrompt(ACCOUNTING_CATEGORIES, validUnits)

    const prompt = [
      examples.length > 0
        ? "Ejemplos históricos (descripción → concepto/categoría/propiedad ya confirmados):\n" +
          examples
            .map((e) => `- "${e.description}" → concept="${e.concept}", category="${e.category}", property="${e.property ?? "null"}"`)
            .join("\n")
        : "No hay ejemplos históricos disponibles todavía.",
      "\nClasifica estos movimientos nuevos:\n" +
        movements
          .map((m) => {
            const parts = [
              `id=${m.bankMovementId}`,
              `date=${m.date.toISOString().slice(0, 10)}`,
              `amount=${m.amount}`,
              `description="${m.description}"`,
            ]
            if (m.currentConcept) parts.push(`currentConcept="${m.currentConcept}"`)
            if (m.currentCategory) parts.push(`currentCategory="${m.currentCategory}"`)
            if (m.currentProperty) parts.push(`currentProperty="${m.currentProperty}"`)
            return `- ${parts.join(" ")}`
          })
          .join("\n"),
    ].join("\n")

    const { object } = await trackedGenerateObject(
      {
        model: google("gemini-3.1-flash-lite"),
        schema: ClassificationBatchSchema,
        system,
        prompt,
        abortSignal: AbortSignal.timeout(CLASSIFY_TIMEOUT_MS),
      },
      {
        userId: opts.userId,
        feature: "bank_statement_classification",
        bankStatementId: opts.bankStatementId,
        itemCount: movements.length,
      }
    )

    const items = new Map<string, ClassificationItem>()
    for (const item of object.results) {
      // Defense in depth: never trust a category/property outside the known valid lists,
      // regardless of what the model returned.
      const category = item.category && ACCOUNTING_CATEGORIES.includes(item.category as (typeof ACCOUNTING_CATEGORIES)[number])
        ? item.category
        : null
      const property = item.property && validUnits.includes(item.property) ? item.property : null
      items.set(item.bankMovementId, { ...item, category, property })
    }

    return { ok: true, items }
  } catch (err) {
    console.error("[classifyMovements] LLM classification failed:", err)
    return { ok: false, items: new Map(), error: err instanceof Error ? err.message : String(err) }
  }
}
