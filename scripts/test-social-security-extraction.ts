// Runs the planilla (PILA) extractor against a real file and checks it against values read by hand.
// Makes one real LLM call (logged in AiCallLog, as usual).
//
//   npx tsx scripts/test-social-security-extraction.ts "C:/Users/<you>/Downloads/Autoliquidaciones_88808629_Consolidado.pdf"
import { readFileSync } from "node:fs"
import { prisma } from "../lib/db"
import { extractSocialSecurityFields, SOCIAL_SECURITY_MEDIA_TYPES } from "../lib/social-security/extract"

// Planilla 88808629 (septiembre 2026), read by hand from the PDF.
const EXPECTED = {
  isPlanilla: true,
  planillaNumber: "88808629",
  period: "2026-09",
  paidDate: "2026-10-13",
  total: 96900,
  pension: 70100,
  health: 0,
  risk: 9200,
  compensationFund: 17600,
  employerNit: "902000058",
  affiliateIdNumber: "30324507",
}

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('Falta el archivo. Uso: npx tsx scripts/test-social-security-extraction.ts "<ruta al PDF>"')
    process.exitCode = 1
    return
  }
  const user = await prisma.user.findFirstOrThrow({ where: { accountingRecords: { some: {} } } })
  const ext = file.toLowerCase().split(".").pop() ?? ""
  const started = Date.now()
  const res = await extractSocialSecurityFields(readFileSync(file), SOCIAL_SECURITY_MEDIA_TYPES[ext], { userId: user.id })
  console.log(`(${((Date.now() - started) / 1000).toFixed(1)}s)`)
  if (!res.ok || !res.data) {
    console.log(`✗ falló: ${res.error}`)
    process.exitCode = 1
    return
  }
  let failures = 0
  for (const [key, expected] of Object.entries(EXPECTED)) {
    const actual = res.data[key as keyof typeof res.data]
    const ok = actual === expected
    if (!ok) failures++
    console.log(`  ${ok ? "✓" : "✗"} ${key}: ${JSON.stringify(actual)}${ok ? "" : `  (esperado ${JSON.stringify(expected)})`}`)
  }
  console.log(`  affiliateName: ${JSON.stringify(res.data.affiliateName)} · confidence: ${res.data.confidence}`)
  console.log(failures === 0 ? "Todo coincide." : `${failures} diferencia(s).`)
  if (failures > 0) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error("FALLO:", e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
