import { generateObject, type FlexibleSchema, type InferSchema, type GenerateObjectResult, type JSONValue } from "ai"
import { prisma } from "@/lib/db"
import { estimateCostUsd } from "./pricing"

export type AiCallFeature = "bank_statement_classification" | "invoice_extraction"

export interface TrackMeta {
  userId: string
  feature: AiCallFeature
  bankStatementId?: string
  itemCount?: number
}

// Thin wrapper around generateObject that measures duration, captures token usage, estimates
// the cost, and writes it to AiCallLog — so classify.ts/extract.ts don't each duplicate this.
// The generic parameters mirror generateObject's own so `object` keeps inferring from `schema`
// at the call site exactly like a direct generateObject call would.
export async function trackedGenerateObject<
  SCHEMA extends FlexibleSchema<unknown> = FlexibleSchema<JSONValue>,
  OUTPUT extends "object" | "array" | "enum" | "no-schema" = InferSchema<SCHEMA> extends string ? "enum" : "object",
  RESULT = OUTPUT extends "array" ? Array<InferSchema<SCHEMA>> : InferSchema<SCHEMA>,
>(
  args: Parameters<typeof generateObject<SCHEMA, OUTPUT, RESULT>>[0],
  meta: TrackMeta
): Promise<GenerateObjectResult<RESULT>> {
  const start = Date.now()
  const model = typeof args.model === "string" ? args.model : args.model.modelId

  try {
    const result = await generateObject<SCHEMA, OUTPUT, RESULT>(args)
    await logCall(meta, {
      model,
      success: true,
      durationMs: Date.now() - start,
      inputTokens: result.usage.inputTokens ?? null,
      outputTokens: result.usage.outputTokens ?? null,
      totalTokens: result.usage.totalTokens ?? null,
    })
    return result
  } catch (err) {
    await logCall(meta, {
      model,
      success: false,
      durationMs: Date.now() - start,
      errorMessage: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

async function logCall(
  meta: TrackMeta,
  data: {
    model: string
    success: boolean
    durationMs: number
    inputTokens?: number | null
    outputTokens?: number | null
    totalTokens?: number | null
    errorMessage?: string
  }
) {
  try {
    const estimatedCostUsd =
      data.inputTokens != null && data.outputTokens != null
        ? estimateCostUsd(data.model, data.inputTokens, data.outputTokens)
        : null

    await prisma.aiCallLog.create({
      data: {
        userId: meta.userId,
        feature: meta.feature,
        bankStatementId: meta.bankStatementId,
        itemCount: meta.itemCount,
        ...data,
        estimatedCostUsd,
      },
    })
  } catch (err) {
    console.error("[trackedGenerateObject] failed to log AI call:", err)
  }
}
