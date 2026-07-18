import type { BankStatementData, BankMovementData } from "./parse-excel"

function parseRowDate(value: string): Date {
  if (!/^\d{8}$/.test(value)) throw new Error(`Fecha inválida en el CSV (se esperaba YYYYMMDD): "${value}"`)
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(4, 6))
  const day = Number(value.slice(6, 8))
  return new Date(year, month - 1, day)
}

function parseRowAmount(value: string): number {
  const amount = parseFloat(value)
  if (isNaN(amount)) throw new Error(`Monto inválido en el CSV: "${value}"`)
  return amount
}

// Este formato lo exporta el core bancario directamente: sin encabezado, sin sección de
// resumen (cliente/saldos/totales) y sin saldo corriente por movimiento. Cada línea trae
// 10 campos separados por coma (el último queda vacío por la coma final de cada fila).
export function parseBankStatementCsv(buffer: Buffer): BankStatementData {
  const lines = buffer
    .toString("utf-8")
    .split(/\r\n|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) throw new Error("El archivo CSV está vacío.")

  const movements: BankMovementData[] = lines.map((line) => {
    const cols = line.split(",").map((c) => c.trim())
    if (cols.length < 9) throw new Error(`Fila del CSV con menos columnas de las esperadas: "${line}"`)

    return {
      date: parseRowDate(cols[3]),
      description: cols[7],
      // Este formato no trae sucursal ni saldo por movimiento (a diferencia del Excel).
      branch: null,
      // cols[6] no es un número de documento único: es un código de tipo de transacción que
      // se repite entre movimientos y correlaciona con la descripción (ej. siempre "3339" +
      // "IMPTO GOBIERNO 4X1000"). Se mapea igual por ser el campo libre más parecido que existe.
      document: cols[6],
      amount: parseRowAmount(cols[5]),
      balance: null,
      // cols[2], cols[4] y cols[8] están presentes en el archivo pero siempre vacíos/"0" en
      // los ejemplos vistos — no se mapean a ningún campo por ahora.
    }
  })

  const dates = movements.map((m) => m.date.getTime())
  const firstCols = lines[0].split(",").map((c) => c.trim())

  return {
    client: null,
    address: null,
    city: null,
    accountType: null,
    accountNumber: firstCols[0] || null,
    branch: firstCols[1] || null,
    startDate: new Date(Math.min(...dates)),
    endDate: new Date(Math.max(...dates)),
    previousBalance: null,
    totalCredits: movements.filter((m) => m.amount > 0).reduce((sum, m) => sum + m.amount, 0),
    totalDebits: movements.filter((m) => m.amount < 0).reduce((sum, m) => sum + Math.abs(m.amount), 0),
    currentBalance: null,
    averageBalance: null,
    interest: null,
    taxWithholding: null,
    movements,
  }
}
