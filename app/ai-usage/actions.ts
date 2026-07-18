"use server"

import { prisma } from "@/lib/db"
import { auth } from "@/auth"

export type AiCallLogData = {
  id: string
  feature: string
  model: string
  success: boolean
  errorMessage: string | null
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  estimatedCostUsd: string | null
  itemCount: number | null
  durationMs: number | null
  createdAt: string
}

export async function listAiCallLogs(): Promise<AiCallLogData[]> {
  const session = await auth()
  if (!session?.user?.email) return []
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return []

  const logs = await prisma.aiCallLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  })

  return logs.map((l) => ({
    id: l.id,
    feature: l.feature,
    model: l.model,
    success: l.success,
    errorMessage: l.errorMessage,
    inputTokens: l.inputTokens,
    outputTokens: l.outputTokens,
    totalTokens: l.totalTokens,
    estimatedCostUsd: l.estimatedCostUsd?.toString() ?? null,
    itemCount: l.itemCount,
    durationMs: l.durationMs,
    createdAt: l.createdAt.toISOString(),
  }))
}
