// Regression check: re-classifies a sample of movements whose classification a human already
// confirmed, and reports where the classifier now disagrees. Read-only apart from AiCallLog.
import { prisma } from "../lib/db"
import { classifyMovements } from "../lib/accounting/classify"

async function main() {
  // Records a human explicitly confirmed — the closest thing to ground truth in this repo.
  const records = await prisma.accountingRecord.findMany({
    where: {
      bankMovementId: { not: null },
      category: { not: null },
      categoryConfirmed: true,
      date: { lt: new Date("2026-08-01") },
    },
    select: {
      date: true, income: true, expenses: true, category: true, property: true,
      propertyConfirmed: true, userId: true,
      bankMovement: { select: { id: true, description: true } },
    },
    orderBy: { date: "desc" },
    take: 25,
  })

  if (records.length === 0) {
    console.log("No hay registros confirmados para comparar.")
    return
  }

  const result = await classifyMovements(
    records.map((r) => ({
      bankMovementId: r.bankMovement!.id,
      description: r.bankMovement!.description,
      date: r.date,
      amount: r.income != null ? Number(r.income) : -Number(r.expenses ?? 0),
    })),
    { userId: records[0].userId }
  )

  if (!result.ok) {
    console.error("La clasificación falló:", result.error)
    process.exitCode = 1
    return
  }

  let catOk = 0, catBad = 0, propOk = 0, propBad = 0, propDropped = 0
  const problems: string[] = []

  for (const r of records) {
    const g = result.items.get(r.bankMovement!.id)
    const amount = r.income != null ? Number(r.income) : -Number(r.expenses ?? 0)
    const label = `${r.date.toISOString().slice(0, 10)} "${r.bankMovement!.description}" (${amount})`

    if (g?.category === r.category) catOk++
    else {
      catBad++
      problems.push(`  CATEGORIA  ${label}\n     confirmado=${r.category}  propuesto=${g?.category ?? "null"}`)
    }

    if (!r.propertyConfirmed) continue
    if (g?.property === r.property) propOk++
    else if (g?.property == null && r.property != null) {
      propDropped++
      problems.push(`  PROPIEDAD (a revisión)  ${label}\n     confirmado=${r.property}  propuesto=null  conf=${g?.confidence}`)
    } else {
      propBad++
      problems.push(`  PROPIEDAD (INCORRECTA)  ${label}\n     confirmado=${r.property ?? "null"}  propuesto=${g?.property}`)
    }
  }

  console.log(`Muestra: ${records.length} registros confirmados\n`)
  console.log(`Categoría:   ${catOk} coinciden, ${catBad} difieren`)
  console.log(`Propiedad:   ${propOk} coinciden, ${propDropped} bajadas a null (van a revisión), ${propBad} atribuidas a OTRA propiedad`)
  if (problems.length > 0) {
    console.log("\nDiferencias:")
    console.log(problems.join("\n"))
  }
}

main()
  .catch((e) => {
    console.error("FALLO:", e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
