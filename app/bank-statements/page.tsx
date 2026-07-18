import { prisma } from "@/lib/db"
import { BaseLayout } from "@/components/base-layout"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { UploadExtractoForm } from "./upload-form"
import { DeleteStatementButton, ProcessStatementButton, MoveToAccountingButton } from "./statement-actions"
import { Button } from "@/components/ui/button"
import { ArrowRight, BookCheck, CheckCircle2, Download } from "lucide-react"

function formatCurrency(value: { toString(): string } | number | string) {
  return Number(value.toString()).toLocaleString("es-CO", { minimumFractionDigits: 2 })
}

function formatDate(date: Date) {
  const d = new Date(date)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    .toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })
}

export default async function BankStatementsPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")

  const statements = await prisma.bankStatement.findMany({
    where: { userId: user.id },
    orderBy: { startDate: { sort: "asc", nulls: "last" } },
    include: {
      movements: {
        select: { id: true, accountingRecord: { select: { id: true } } },
      },
    },
  })

  return (
    <BaseLayout wide>
      <div className="flex flex-1 flex-col min-h-0 gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Extractos Bancarios</h1>
            <p className="text-sm text-muted-foreground">
              {statements.length} {statements.length === 1 ? "extracto" : "extractos"} cargados
            </p>
          </div>
          <UploadExtractoForm />
        </div>

        {statements.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
            <p className="text-muted-foreground">Aún no se han cargado extractos.</p>
            <p className="mt-1 text-sm text-muted-foreground">Sube un archivo Excel (.xlsx, .xlsm) para comenzar.</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">Período</th>
                  <th className="px-4 py-3 text-left font-medium">Archivo</th>
                  <th className="px-4 py-3 text-left font-medium">Cuenta</th>
                  <th className="px-4 py-3 text-right font-medium">Total Créditos</th>
                  <th className="px-4 py-3 text-right font-medium">Total Débitos</th>
                  <th className="px-4 py-3 text-right font-medium">Saldo Actual</th>
                  <th className="px-4 py-3 text-center font-medium">Movimientos Sincronizados</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {statements.map((s) => {
                  const processed = s.startDate !== null
                  const total = s.movements.length
                  const synced = s.movements.filter((m) => m.accountingRecord !== null).length
                  const allSynced = total > 0 && synced === total
                  return (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 text-muted-foreground">
                        {s.startDate && s.endDate
                          ? `${formatDate(s.startDate)} — ${formatDate(s.endDate)}`
                          : <span>—</span>}
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <span className="truncate block text-xs text-muted-foreground" title={s.fileName}>
                          {s.fileName}
                        </span>
                        {!processed && (
                          <span className="mt-0.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            Pendiente
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {s.accountNumber ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-green-600">
                        {s.totalCredits != null ? formatCurrency(s.totalCredits) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-red-600">
                        {s.totalDebits != null ? formatCurrency(s.totalDebits) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {s.currentBalance != null ? formatCurrency(s.currentBalance) : <span className="text-muted-foreground font-normal">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {!processed ? (
                          <span className="text-muted-foreground">—</span>
                        ) : allSynced ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {total}/{total}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{synced}/{total}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <DeleteStatementButton id={s.id} />
                          {s.fileUrl && (
                            <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                              <a href={`/api/bank-statements/${s.id}/download`}>
                                <Download className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          {!processed && s.fileUrl && <ProcessStatementButton id={s.id} />}
                          {processed && (
                            allSynced ? (
                              <span className="flex h-8 w-8 items-center justify-center text-green-600" title="Todos los movimientos sincronizados">
                                <BookCheck className="h-4 w-4" />
                              </span>
                            ) : (
                              <MoveToAccountingButton id={s.id} />
                            )
                          )}
                          {processed && (
                            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                              <Link href={`/bank-statements/${s.id}`}>
                                <ArrowRight className="h-4 w-4" />
                              </Link>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </BaseLayout>
  )
}
