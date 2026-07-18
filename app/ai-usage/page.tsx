import { BaseLayout } from "@/components/base-layout"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { listAiCallLogs } from "./actions"
import { AiUsageTable } from "./table"
import { formatUsdCost } from "@/lib/currency"

export default async function AiUsagePage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const logs = await listAiCallLogs()

  const totalCost = logs.reduce((s, l) => s + Number(l.estimatedCostUsd ?? 0), 0)
  const totalTokens = logs.reduce((s, l) => s + (l.totalTokens ?? 0), 0)
  const successRate = logs.length > 0 ? (logs.filter((l) => l.success).length / logs.length) * 100 : 0

  return (
    <BaseLayout wide>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">Costos de IA</h1>
          <p className="text-sm text-muted-foreground">
            {logs.length} {logs.length === 1 ? "llamado" : "llamados"} a modelos de IA
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Llamados</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{logs.length}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Costo estimado</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{formatUsdCost(totalCost)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tokens totales</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{totalTokens.toLocaleString("es-CO")}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tasa de éxito</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{successRate.toFixed(0)}%</CardContent>
          </Card>
        </div>

        <AiUsageTable logs={logs} />
      </div>
    </BaseLayout>
  )
}
