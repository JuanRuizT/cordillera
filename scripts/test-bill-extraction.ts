// Runs the bill extractor against real example files and checks the result against values read
// by hand from each document. Makes real LLM calls (each logs an AiCallLog row, as usual).
//
//   npx tsx scripts/test-bill-extraction.ts "C:/Users/<you>/Downloads/<carpeta con las facturas>"
import { readFileSync } from "node:fs"
import path from "node:path"
import { prisma } from "../lib/db"
import { extractBillFields, buildBillNotes, BILL_EXTRACTION_MEDIA_TYPES } from "../lib/bills/extract"

type Case = {
  file: string
  isBill: boolean
  amount?: number
  issueDate?: string
  dueDate?: string
  previousBalance?: number | null
}

const CASES: Case[] = [
  // Old CHEC layout: "Factura del mes de 15/OCT/2025".
  { file: "2025-10 Factura Chec.pdf", isBill: true, amount: 101964, issueDate: "2025-10-15", dueDate: "2025-11-04", previousBalance: null },
  // New layout, total includes May's unpaid balance ($88.253) — must pick the total, not the month.
  { file: "2026-05 y 2026-06 Factura Chec.pdf", isBill: true, amount: 186181, issueDate: "2026-06-17", dueDate: "2026-07-03", previousBalance: 88253 },
  { file: "2026-07 Factura Chec.pdf", isBill: true, amount: 127628, issueDate: "2026-07-14", dueDate: "2026-08-03", previousBalance: null },
  // A Bancolombia PSE payment receipt, not a bill — must be flagged, not filled in.
  { file: "2026-07 Pago Chec.pdf", isBill: false },
]

function check(label: string, actual: unknown, expected: unknown): boolean {
  const ok = actual === expected
  console.log(`    ${ok ? "✓" : "✗"} ${label}: ${JSON.stringify(actual)}${ok ? "" : `  (esperado ${JSON.stringify(expected)})`}`)
  return ok
}

async function main() {
  const dir = process.argv[2]
  if (!dir) {
    console.error('Falta la carpeta. Uso: npx tsx scripts/test-bill-extraction.ts "<carpeta>"')
    process.exitCode = 1
    return
  }
  const user = await prisma.user.findFirstOrThrow({ where: { bills: { some: {} } } })

  let failures = 0
  for (const c of CASES) {
    const ext = c.file.toLowerCase().split(".").pop() ?? ""
    const buffer = readFileSync(path.join(dir, c.file))
    const started = Date.now()
    const res = await extractBillFields(buffer, BILL_EXTRACTION_MEDIA_TYPES[ext], { userId: user.id })
    const secs = ((Date.now() - started) / 1000).toFixed(1)

    console.log(`\n${c.file}  (${secs}s)`)
    if (!res.ok || !res.data) {
      console.log(`    ✗ falló: ${res.error}`)
      failures++
      continue
    }
    const d = res.data
    const results = [check("isBill", d.isBill, c.isBill)]
    if (c.isBill) {
      results.push(
        check("amount", d.amount, c.amount),
        check("issueDate", d.issueDate, c.issueDate),
        check("dueDate", d.dueDate, c.dueDate),
        check("previousBalance", d.previousBalance, c.previousBalance),
      )
      console.log(`      concept: ${JSON.stringify(d.concept)} · period: ${JSON.stringify(d.period)} · confidence: ${d.confidence}`)
      console.log(`      notes:   ${JSON.stringify(buildBillNotes(d))}`)
    } else {
      console.log(`      documentKind: ${JSON.stringify(d.documentKind)}`)
    }
    if (results.includes(false)) failures++
  }

  console.log(`\n${failures === 0 ? "Todos los casos OK." : `${failures} caso(s) con diferencias.`}`)
  if (failures > 0) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error("FALLO:", e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
