import { prisma } from "@/lib/db"
import { BaseLayout } from "@/components/base-layout"
import { auth } from "@/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react"

function formatCurrency(value: { toString(): string } | number | string) {
  return Number(value.toString()).toLocaleString("es-CO", { minimumFractionDigits: 2 })
}

function formatDate(date: Date) {
  const d = new Date(date)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    .toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })
}

export default async function BankStatementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")

  const { id } = await params

  const statement = await prisma.bankStatement.findFirst({
    where: { id, userId: user.id },
    include: {
      movements: {
        orderBy: { date: "asc" },
        include: { accountingRecord: { select: { id: true } } },
      },
    },
  })

  if (!statement) notFound()

  return (
    <BaseLayout wide>
      <div className="flex flex-1 flex-col min-h-0 gap-6">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/bank-statements">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Extracto {statement.accountNumber ?? statement.fileName}</h1>
            <p className="text-sm text-muted-foreground">
              {statement.startDate && statement.endDate
                ? `${formatDate(statement.startDate)} — ${formatDate(statement.endDate)}`
                : "Sin procesar"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Saldo Anterior</p>
            <p className="mt-1 text-lg font-semibold">{statement.previousBalance != null ? formatCurrency(statement.previousBalance) : "—"}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Total Créditos</p>
            <p className="mt-1 text-lg font-semibold text-green-600">{statement.totalCredits != null ? formatCurrency(statement.totalCredits) : "—"}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Total Débitos</p>
            <p className="mt-1 text-lg font-semibold text-red-600">{statement.totalDebits != null ? formatCurrency(statement.totalDebits) : "—"}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Saldo Actual</p>
            <p className="mt-1 text-lg font-semibold">{statement.currentBalance != null ? formatCurrency(statement.currentBalance) : "—"}</p>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-base font-semibold">
            Movimientos ({statement.movements.length})
          </h2>
          <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">ID</th>
                  <th className="px-4 py-3 text-left font-medium">Fecha</th>
                  <th className="px-4 py-3 text-left font-medium">Descripción</th>
                  <th className="px-4 py-3 text-right font-medium">Monto</th>
                  <th className="px-4 py-3 text-right font-medium">Balance</th>
                  <th className="px-4 py-3 text-center font-medium">Contabilidad</th>
                </tr>
              </thead>
              <tbody>
                {statement.movements.map((m) => (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground" title={m.id}>
                      {m.id.slice(-8)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(m.date)}
                    </td>
                    <td className="px-4 py-3">{m.description}</td>
                    <td className={`px-4 py-3 text-right font-mono ${Number(m.amount.toString()) < 0 ? "text-red-600" : "text-green-600"}`}>
                      {Number(m.amount.toString()) >= 0 ? "+" : ""}{formatCurrency(m.amount)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatCurrency(m.balance)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {m.accountingRecord
                        ? <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                        : <Circle className="h-4 w-4 text-muted-foreground/40 mx-auto" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </BaseLayout>
  )
}
