import { parseBankStatement as parseExcelStatement } from "./parse-excel"
import { parseBankStatementCsv } from "./parse-csv"
import type { BankStatementData } from "./parse-excel"

export type { BankStatementData, BankMovementData } from "./parse-excel"

export function parseBankStatement(buffer: Buffer, fileName: string): BankStatementData {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."))
  return ext === ".csv" ? parseBankStatementCsv(buffer) : parseExcelStatement(buffer)
}
