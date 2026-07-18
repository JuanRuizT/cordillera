import {
  generateObject,
  APICallError,
  RetryError,
  type FlexibleSchema,
  type InferSchema,
  type GenerateObjectResult,
  type JSONValue,
  type Prompt,
} from "ai"
import { google } from "@ai-sdk/google"
import { prisma } from "@/lib/db"
import { estimateCostUsd } from "./pricing"
import { GEMINI_MODEL_CHAIN } from "./models"

export type AiCallFeature = "bank_statement_classification" | "invoice_extraction" | "bill_extraction" | "social_security_extraction"

export interface TrackMeta {
  userId: string
  feature: AiCallFeature
  bankStatementId?: string
  itemCount?: number
}

// The request as callers describe it. Deliberately narrower than generateObject's own options:
// model, abortSignal and retries belong to this module, and taking `schema` as a direct property —
// rather than omitting keys from generateObject's large conditional/union options type — is what
// keeps TypeScript inferring the result's `object` type from the schema at each call site.
export type TrackedObjectRequest<SCHEMA extends FlexibleSchema<unknown>> = Prompt & {
  schema: SCHEMA
  providerOptions?: Record<string, Record<string, JSONValue>>
}

type GenerateObjectArgs<SCHEMA extends FlexibleSchema<unknown>> = Parameters<
  typeof generateObject<SCHEMA, "object", InferSchema<SCHEMA>>
>[0]

// Retries the SDK makes on the SAME model (with backoff) before this module gives up on it and
// moves to the next one. One retry absorbs a momentary blip without paying for the backup model —
// pricier, and on the free tier it has its own small daily quota. More than that mostly repeats a
// saturated model: three attempts in a row all hitting 503 is what left calls hanging ~45s before
// the fallback existed.
const RETRIES_BEFORE_FALLBACK = 1
// The last model in the chain keeps the SDK's default: there's nowhere left to fall back to.
const LAST_MODEL_RETRIES = 2

/**
 * Failures another model may well not have: capacity (503 "high demand", 429 rate limit/quota,
 * other retryable 5xx), our per-attempt timeout, or a model the API no longer serves (404 —
 * Google retires models). Anything else (bad request, schema/validation errors) would fail the
 * same way on any model.
 */
function shouldFailOver(err: unknown): boolean {
  if (APICallError.isInstance(err)) return err.isRetryable || err.statusCode === 404
  if (RetryError.isInstance(err)) return shouldFailOver(err.lastError)
  const name = typeof err === "object" && err !== null && "name" in err ? String(err.name) : ""
  return name === "TimeoutError" || name === "AbortError"
}

// Wrapper around generateObject that owns WHICH model runs a request (GEMINI_MODEL_CHAIN, with
// automatic fallback) and for how long, and logs every attempt to AiCallLog — duration, token usage,
// estimated cost, and the model actually used — so a fallback shows up in Costos IA as a failed
// primary attempt followed by the backup's call.
export async function trackedGenerateObject<SCHEMA extends FlexibleSchema<unknown>>(
  request: TrackedObjectRequest<SCHEMA>,
  meta: TrackMeta,
  // Per model attempt, not for the whole call: a shared deadline would leave the backup model
  // no time at all whenever the primary is the one hanging.
  opts: { timeoutMs: number }
): Promise<GenerateObjectResult<InferSchema<SCHEMA>>> {
  let lastError: unknown

  for (let i = 0; i < GEMINI_MODEL_CHAIN.length; i++) {
    const model = GEMINI_MODEL_CHAIN[i]
    const isLast = i === GEMINI_MODEL_CHAIN.length - 1
    const start = Date.now()

    try {
      // The cast only bridges TrackedObjectRequest (a strict subset of the options) to
      // generateObject's conditional options type, which TypeScript can't relate structurally.
      const args = {
        ...request,
        model: google(model),
        abortSignal: AbortSignal.timeout(opts.timeoutMs),
        maxRetries: isLast ? LAST_MODEL_RETRIES : RETRIES_BEFORE_FALLBACK,
      } as unknown as GenerateObjectArgs<SCHEMA>
      const result = await generateObject<SCHEMA, "object", InferSchema<SCHEMA>>(args)
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
      const errorMessage = err instanceof Error ? err.message : String(err)
      await logCall(meta, { model, success: false, durationMs: Date.now() - start, errorMessage })
      lastError = err
      if (isLast || !shouldFailOver(err)) throw err
      console.warn(`[trackedGenerateObject] ${model} falló (${errorMessage.split("\n")[0]}); usando respaldo ${GEMINI_MODEL_CHAIN[i + 1]}`)
    }
  }

  throw lastError
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
