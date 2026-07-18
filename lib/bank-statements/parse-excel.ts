import * as XLSX from "xlsx"

export type BankMovementData = {
  date: Date
  description: string
  branch: string | null
  document: string | null
  amount: number
  balance: number
}

export type BankStatementData = {
  client: string
  address: string | null
  city: string | null
  accountType: string
  accountNumber: string
  branch: string | null
  startDate: Date
  endDate: Date
  previousBalance: number
  totalCredits: number
  totalDebits: number
  currentBalance: number
  averageBalance: number | null
  interest: number | null
  taxWithholding: number | null
  movements: BankMovementData[]
}

function parseDecimal(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0
  const str = String(value).replace(/,/g, "").trim()
  const num = parseFloat(str)
  return isNaN(num) ? 0 : num
}

function parseFullDate(value: unknown): Date {
  const str = String(value ?? "").trim()
  if (!str) throw new Error(`Invalid date: ${JSON.stringify(value)}`)
  return new Date(str.replace(/\//g, "-"))
}

function parseMovDate(value: unknown, year: number): Date {
  // The movement date column is usually plain "DD/MM" text, but some statements export it
  // as a native Excel date (a JS Date once xlsx auto-detects it, or a raw day-count serial).
  if (value instanceof Date) return value

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) throw new Error(`Invalid movement date serial: ${JSON.stringify(value)}`)
    return new Date(parsed.y, parsed.m - 1, parsed.d)
  }

  const str = String(value ?? "").trim()
  if (!str) throw new Error(`Invalid movement date: ${JSON.stringify(value)}`)
  const [day, month] = str.split("/")
  if (!day || !month) throw new Error(`Invalid movement date format: ${JSON.stringify(value)}`)
  return new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`)
}

function cell(sheet: XLSX.WorkSheet, row: number, col: number): unknown {
  return sheet[XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })]?.v ?? null
}

function str(sheet: XLSX.WorkSheet, row: number, col: number): string {
  return String(cell(sheet, row, col) ?? "").trim()
}

// The number of title/blank spacer rows above each section varies slightly between statement
// exports, so locate each section by its known header label instead of a fixed row number.
function findHeaderRow(sheet: XLSX.WorkSheet, label: string): number {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1")
  for (let r = range.s.r + 1; r <= range.e.r + 1; r++) {
    if (str(sheet, r, 1).toUpperCase() === label) return r
  }
  throw new Error(`No se encontró el encabezado "${label}" en el extracto.`)
}

export function parseBankStatement(buffer: Buffer): BankStatementData {
  const workbook = XLSX.read(buffer, { type: "buffer" })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]

  const clientRow = findHeaderRow(sheet, "CLIENTE") + 1
  const client = str(sheet, clientRow, 1)
  const address = str(sheet, clientRow, 2) || null
  const city = str(sheet, clientRow, 3) || null

  const generalRow = findHeaderRow(sheet, "DESDE") + 1
  const startDate = parseFullDate(cell(sheet, generalRow, 1))
  const endDate = parseFullDate(cell(sheet, generalRow, 2))
  const accountType = str(sheet, generalRow, 3)
  const accountNumber = str(sheet, generalRow, 4)
  const branch = str(sheet, generalRow, 5) || null

  const resumenRow = findHeaderRow(sheet, "SALDO ANTERIOR") + 1
  const previousBalance = parseDecimal(cell(sheet, resumenRow, 1))
  const totalCredits = parseDecimal(cell(sheet, resumenRow, 2))
  const totalDebits = parseDecimal(cell(sheet, resumenRow, 3))
  const currentBalance = parseDecimal(cell(sheet, resumenRow, 4))
  const averageBalance = parseDecimal(cell(sheet, resumenRow, 5)) || null
  const interest = parseDecimal(cell(sheet, resumenRow, 7)) || null
  const taxWithholding = parseDecimal(cell(sheet, resumenRow, 8)) || null

  const statementYear = endDate.getFullYear()
  const movements: BankMovementData[] = []
  let row = findHeaderRow(sheet, "FECHA") + 1

  while (true) {
    const dateVal = cell(sheet, row, 1)
    if (!dateVal) break

    const dateStr = String(dateVal).trim().toUpperCase()
    if (dateStr.includes("FIN") || dateStr === "") break

    const description = str(sheet, row, 2)
    if (!description) break

    movements.push({
      date: parseMovDate(dateVal, statementYear),
      description,
      branch: str(sheet, row, 3) || null,
      document: str(sheet, row, 4) || null,
      amount: parseDecimal(cell(sheet, row, 5)),
      balance: parseDecimal(cell(sheet, row, 6)),
    })

    row++
  }

  return {
    client,
    address,
    city,
    accountType,
    accountNumber,
    branch,
    startDate,
    endDate,
    previousBalance,
    totalCredits,
    totalDebits,
    currentBalance,
    averageBalance,
    interest,
    taxWithholding,
    movements,
  }
}
