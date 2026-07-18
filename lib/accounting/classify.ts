import { z } from "zod"
import { prisma } from "@/lib/db"
import { trackedGenerateObject } from "@/lib/ai/tracked-generate-object"
import { ACCOUNTING_CATEGORIES, ACCOUNTING_CATEGORY_SIGN } from "./categories"
import { buildSystemPrompt, ALL_PAYER_ALIASES } from "./classification-context"

export const AI_REVIEW_THRESHOLD = 0.7
const MAX_FEWSHOT_EXAMPLES = 60
// How many examples one bank description may contribute. Generic texts cover several different
// classifications; showing a few of them is the point, but one description must not crowd out
// the rest of the history either.
const MAX_EXAMPLES_PER_DESCRIPTION = 4
// Confidence ceiling forced onto a movement whose payer cannot be identified from the text.
// Below AI_REVIEW_THRESHOLD so the row shows up highlighted for human review.
const ANONYMOUS_PAYER_CONFIDENCE = 0.25
// Gemini 3.x reasons before answering, and the explicit disambiguation rules in the system prompt
// push it to think hard: an uncapped call on this prompt was measured at ~53s, well past the old
// 25s limit, and a timeout here silently drops classification for a whole statement (every record
// lands uncategorized). Cap the reasoning and leave generous headroom over it.
const CLASSIFY_THINKING_LEVEL = "low" as const
const CLASSIFY_TIMEOUT_MS = 60_000 // per model attempt — trackedGenerateObject falls back after it

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

export type ClassificationItem = z.infer<typeof ClassificationItemSchema> & {
  // True when the server actively determined the payer cannot be identified from the bank text —
  // as opposed to the model simply not proposing a property. Callers must treat this as a real
  // "it is nobody's, clear it" answer, otherwise a previous wrong attribution survives a
  // reclassification and stays on the books.
  propertyUnidentifiable: boolean
}

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

/** True when the raw bank text contains a known payer alias, i.e. it names who transferred. */
function namesAPayer(description: string): boolean {
  const upper = description.toUpperCase()
  return ALL_PAYER_ALIASES.some((alias) => upper.includes(alias))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Removes owner names from a proposed concept. Used when the payer turns out to be
 * unidentifiable: the concept must not read as a confirmed attribution to someone.
 */
function stripOwnerNames(concept: string, ownerNames: readonly string[], fallback: string): string {
  let out = concept
  for (const name of ownerNames) {
    out = out.replace(new RegExp(escapeRegExp(name), "gi"), "")
  }
  out = out.replace(/\s+/g, " ").replace(/[\s\-–—,:]+$/, "").trim()
  return out.length > 0 ? out : fallback
}

interface FewShotExample {
  description: string
  concept: string
  category: string
  property: string | null
  amount: number // signed, as booked
  ambiguous: boolean
}

interface FewShotContext {
  examples: FewShotExample[]
  // Normalized descriptions that history shows belonging to more than one property. For these the
  // bank text alone can never identify the payer, so a property proposed for one is not trustworthy.
  propertyAmbiguous: Set<string>
}

async function getFewShotExamples(userId: string): Promise<FewShotContext> {
  const history = await prisma.accountingRecord.findMany({
    where: { userId, category: { not: null }, bankMovementId: { not: null } },
    select: {
      concept: true,
      category: true,
      property: true,
      income: true,
      expenses: true,
      bankMovement: { select: { description: true } },
    },
    orderBy: { date: "desc" },
    take: 1000,
  })

  // Group by normalized description rather than keeping only the first record per description.
  // A generic text like "TRANSFERENCIA CTA SUC VIRTUAL" covers admin fees from several different
  // units *and* outgoing supplier payments; collapsing it to one arbitrary example handed the
  // model a single misleading precedent and made it attribute every anonymous transfer to
  // whichever owner happened to appear in that one example.
  const groups = new Map<string, typeof history>()
  for (const r of history) {
    const key = normalizeDescription(r.bankMovement?.description ?? r.concept)
    const group = groups.get(key)
    if (group) group.push(r)
    else groups.set(key, [r])
  }

  const propertyAmbiguous = new Set<string>()
  const examples: FewShotExample[] = []

  for (const [key, rows] of groups) {
    if (new Set(rows.map((r) => r.property ?? "null")).size > 1) propertyAmbiguous.add(key)

    // One example per distinct category/property combination (most recent first) so the model
    // sees the real spread behind an ambiguous description instead of a single confident-looking
    // mapping. Unambiguous descriptions still contribute just one example.
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

  return { examples, propertyAmbiguous }
}

/**
 * The monthly fee amounts actually seen on each unit over time. Owner.monthlyFee only holds the
 * current one, so without this an older payment at a previous rate looks like a stray amount and
 * gets demoted to "Cuota extraordinaria".
 */
async function getHistoricalFeeAmounts(userId: string): Promise<Map<string, number[]>> {
  const rows = await prisma.accountingRecord.findMany({
    where: {
      userId,
      category: "Pago Administración",
      property: { not: null },
      income: { not: null },
      // Leaves only. A payment covering several months is stored as a parent broken down into one
      // child per month, so the parent's amount is a sum of fees, not a fee — feeding it in here
      // would teach the classifier that e.g. $900.000 is a valid monthly fee. Filtering parents
      // out yields exactly the real rates: $300.000/$400.000 per apartment, $50.000 for the local.
      childRecords: { none: {} },
    },
    select: { property: true, income: true },
  })

  const byUnit = new Map<string, Set<number>>()
  for (const r of rows) {
    const amounts = byUnit.get(r.property!) ?? new Set<number>()
    amounts.add(Number(r.income))
    byUnit.set(r.property!, amounts)
  }

  return new Map([...byUnit].map(([unit, amounts]) => [unit, [...amounts].sort((a, b) => a - b)]))
}

export async function classifyMovements(
  movements: MovementToClassify[],
  opts: { userId: string; bankStatementId?: string }
): Promise<ClassifyResult> {
  if (movements.length === 0) return { ok: true, items: new Map() }

  try {
    const [owners, { examples, propertyAmbiguous }, historicalFees] = await Promise.all([
      prisma.owner.findMany({
        select: { unit: true, name: true, monthlyFee: true },
        orderBy: { unit: "asc" },
      }),
      getFewShotExamples(opts.userId),
      getHistoricalFeeAmounts(opts.userId),
    ])
    const validUnits = owners.map((o) => o.unit)
    const ownerNames = owners.map((o) => o.name)
    const system = buildSystemPrompt(
      ACCOUNTING_CATEGORIES,
      owners.map((o) => ({
        unit: o.unit,
        name: o.name,
        monthlyFee: o.monthlyFee != null ? Number(o.monthlyFee) : null,
        historicalFeeAmounts: historicalFees.get(o.unit) ?? [],
      }))
    )

    const prompt = [
      examples.length > 0
        ? "Ejemplos históricos (descripción + monto con signo → concepto/categoría/propiedad ya confirmados).\n" +
          "Los marcados [DESCRIPCIÓN AMBIGUA] comparten un texto bancario que se ha clasificado de varias formas: el texto no decide, usá signo y monto.\n" +
          examples
            .map((e) => {
              const amount = `${e.amount >= 0 ? "+" : ""}${e.amount}`
              const flag = e.ambiguous ? "  [DESCRIPCIÓN AMBIGUA]" : ""
              return `- "${e.description}" amount=${amount} → concept="${e.concept}", category="${e.category}", property="${e.property ?? "null"}"${flag}`
            })
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
        schema: ClassificationBatchSchema,
        system,
        prompt,
        providerOptions: {
          google: { thinkingConfig: { thinkingLevel: CLASSIFY_THINKING_LEVEL } },
        },
      },
      {
        userId: opts.userId,
        feature: "bank_statement_classification",
        bankStatementId: opts.bankStatementId,
        itemCount: movements.length,
      },
      { timeoutMs: CLASSIFY_TIMEOUT_MS }
    )

    const movementById = new Map(movements.map((m) => [m.bankMovementId, m]))

    const items = new Map<string, ClassificationItem>()
    for (const item of object.results) {
      const movement = movementById.get(item.bankMovementId)

      // Defense in depth: never trust a category/property outside the known valid lists,
      // regardless of what the model returned.
      let category = item.category && ACCOUNTING_CATEGORIES.includes(item.category as (typeof ACCOUNTING_CATEGORIES)[number])
        ? item.category
        : null
      let property = item.property && validUnits.includes(item.property) ? item.property : null

      // Some categories only ever make sense on one side of the ledger (e.g. "Cuota
      // extraordinaria" is always money coming in from an owner) — a model can still propose
      // one for a movement with the opposite sign even with the amount right in front of it.
      // Treat that mismatch like a hallucinated category: drop it and force the record into
      // human review rather than trusting a self-contradictory guess.
      let confidence = item.confidence
      let concept = item.concept
      if (category) {
        const requiredSign = ACCOUNTING_CATEGORY_SIGN.get(category)
        const amount = movement?.amount
        const actualSign = amount == null || amount === 0 ? null : amount > 0 ? "income" : "expense"
        if (requiredSign && actualSign && requiredSign !== actualSign) {
          category = null
          confidence = 0
        }
      }

      // Same defense applied to the payer: a generic bank text that names nobody (e.g.
      // "TRANSFERENCIA CTA SUC VIRTUAL") and that history shows spread across several units
      // cannot identify an owner. The model will still happily pick one — and booking another
      // owner's payment against the wrong unit is silent and corrupts the Paz y Salvo balances,
      // so drop it and send the row to human review instead.
      // Skipped when a human already put a property on the record: their call outranks this.
      let propertyUnidentifiable = false
      if (movement && !movement.currentProperty) {
        const isAnonymous = !namesAPayer(movement.description)
        if (isAnonymous && propertyAmbiguous.has(normalizeDescription(movement.description))) {
          propertyUnidentifiable = true
          property = null
          confidence = Math.min(confidence, ANONYMOUS_PAYER_CONFIDENCE)
          // The prompt tells the model not to name an owner when property is null, but here it
          // named one and *we* took the property away — strip the name so the row doesn't read
          // as a confirmed attribution to someone who may not have paid.
          concept = stripOwnerNames(concept, ownerNames, movement.description)
        }
      }

      items.set(item.bankMovementId, { ...item, concept, category, property, confidence, propertyUnidentifiable })
    }

    return { ok: true, items }
  } catch (err) {
    console.error("[classifyMovements] LLM classification failed:", err)
    return { ok: false, items: new Map(), error: err instanceof Error ? err.message : String(err) }
  }
}
