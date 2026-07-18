import { formatCurrency, type CategoryRow } from "@/lib/accounting/analysis"

export function CategoryTable({ rows }: { rows: CategoryRow[] }) {
  const totalIncome = rows.reduce((s, r) => s + r.income, 0)
  const totalExpenses = rows.reduce((s, r) => s + r.expenses, 0)
  const totalNet = totalIncome - totalExpenses
  const totalCount = rows.reduce((s, r) => s + r.count, 0)

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted text-muted-foreground">
            <th className="px-4 py-3 text-left font-medium">Categoría</th>
            <th className="px-4 py-3 text-right font-medium">Transacciones</th>
            <th className="px-4 py-3 text-right font-medium">Ingresos</th>
            <th className="px-4 py-3 text-right font-medium">Egresos</th>
            <th className="px-4 py-3 text-right font-medium">Neto</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const net = row.income - row.expenses
            return (
              <tr key={row.category ?? "__null__"} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  {row.category ?? <span className="text-muted-foreground italic">Sin categoría</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{row.count}</td>
                <td className="px-4 py-3 text-right tabular-nums text-green-600">
                  {row.income > 0 ? formatCurrency(row.income) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-red-600">
                  {row.expenses > 0 ? formatCurrency(row.expenses) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums font-medium ${net >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(net)}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted font-semibold">
            <td className="px-4 py-3">Total</td>
            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{totalCount}</td>
            <td className="px-4 py-3 text-right tabular-nums text-green-600">{formatCurrency(totalIncome)}</td>
            <td className="px-4 py-3 text-right tabular-nums text-red-600">{formatCurrency(totalExpenses)}</td>
            <td className={`px-4 py-3 text-right tabular-nums ${totalNet >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatCurrency(totalNet)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
