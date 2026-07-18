// Static, rarely-changing domain knowledge for the bank-movement classifier.
// Dynamic knowledge (recent already-categorized examples) lives in classify.ts instead.

import { OWNERS } from "../owners"
import { ACCOUNTING_CATEGORY_SIGN } from "./categories"

export const BANKING_GLOSSARY: Record<string, string> = {
  "4X1000": "Gravamen a los Movimientos Financieros — impuesto retenido automáticamente por el banco en transferencias. Categoría: Impuesto.",
  PSE: "Pagos Seguros en Línea — pasarela usada para pagar facturas/impuestos por transferencia (aparece como 'PAGO PSE ...').",
  CHEC: "Central Hidroeléctrica de Caldas, la empresa de energía. 'PAGO PSE Central Hidroelectri' = factura de energía. Categoría: Facturas.",
  DIAN: "Autoridad tributaria colombiana. 'PAGO PSE IMPUESTO DIAN' = retención/impuesto. Categoría: Impuesto.",
  LLAVE: "'PAGO LLAVE X' = transferencia interbancaria a un alias registrado por la persona X, no necesariamente su nombre completo.",
  "CUOTA MANEJO / TRJ DEB / MANEJO TARJ": "Cuota de manejo de tarjeta débito, cobrada mensualmente por el banco (el sufijo/consecutivo cambia cada mes). Categoría: Gastos bancarios, nunca Egreso. Su devolución ('DEV CUOTA MANEJO TARJ DEB', entra como ingreso) también es Gastos bancarios. Nunca lleva property.",
  NEQUI: "Billetera digital colombiana. 'TRANSFERENCIA DESDE NEQUI' NO identifica al pagador por nombre y NO es exclusiva de ningún propietario — cualquiera podría pagar por Nequi. Ver regla de cuotas de administración para cómo desambiguar por monto.",
  "RETIRO CAJERO / RETIRO EFECTIVO": "Retiro de efectivo por cajero automático o ventanilla — es un traslado del banco a la caja física, no un pago a un tercero. Categoría: Retiro en Efectivo. Nunca lleva property.",
  "PILA / SUAPORTE / ENLACE OPERATIVO / APORTES EN LINEA / SEGURIDAD SOCIAL": "Pago de la planilla de aportes a seguridad social del personal (pensión, salud, riesgos, caja). Categoría: Seguridad social, nunca Egreso. Nunca lleva property.",
  "TRANSFERENCIA CTA SUC VIRTUAL": "Texto genérico de la sucursal virtual del banco. NO identifica al pagador ni al beneficiario: lo usan todos los propietarios para pagar y también la administración para pagar proveedores. Ver la regla de pagador no identificable.",
}

export interface OwnerAliasHint {
  unit: string // must match Owner.unit exactly
  bankAliases: string[] // fragments seen after "PAGO LLAVE" or similar
}

// Payer aliases, not owner identity: the fragment that shows up in a transfer description belongs
// to whoever pressed "send", which is not always the registered owner of the unit (a relative or
// tenant may pay on their behalf). So these map alias → unit only; the unit's actual owner name
// comes from the DB (see ClassificationOwner) and must never be inferred from the alias.
//
// Hints only — NOT authoritative. A confirmed real transaction "PAGO LLAVE Juan Pablo" was
// actually property "Apartamento 301" (someone paying on that owner's behalf), so an alias
// match alone must not be trusted blindly. Weigh it against the historical examples provided
// at call time, and prefer lower confidence when they disagree or when there's no precedent.
export const KNOWN_OWNER_ALIASES: OwnerAliasHint[] = OWNERS
  .filter((o) => o.bankAliases.length > 0)
  .map((o) => ({ unit: o.unit, bankAliases: o.bankAliases }))

// Every alias fragment, uppercased — used by classify.ts to tell "the description names a payer"
// apart from "the description is anonymous".
export const ALL_PAYER_ALIASES: readonly string[] = KNOWN_OWNER_ALIASES.flatMap((a) =>
  a.bankAliases.map((f) => f.toUpperCase())
)

// The unit's monthly admin fee, as maintained by the user in the Paz y Salvo screen
// (Owner.monthlyFee) — the authoritative per-unit amount. Never hardcode fee amounts here:
// they change (they went from $300.000 to $400.000 in April 2026) and differ per unit.
export interface ClassificationOwner {
  unit: string
  name: string
  monthlyFee: number | null
  // Every monthly fee rate this unit has actually paid, derived from history. The fee went up over
  // time ($300.000 → $400.000 in April 2026), so a payment at an older rate is still an admin fee,
  // not an extraordinary one — with only today's amount the classifier demotes all of them.
  // These are single-month rates: a payment covering several months is a multiple of one of these.
  historicalFeeAmounts: number[]
}

function formatCop(value: number): string {
  return "$" + value.toLocaleString("es-CO", { maximumFractionDigits: 0 })
}

export const CLASSIFICATION_RULES = `
- REGLA CRÍTICA — pagador no identificable. Si la descripción bancaria no contiene ningún alias de
  pagador reconocible (p.ej. "TRANSFERENCIA CTA SUC VIRTUAL", "CONSIGNACION CORRESPONSAL CB" u otro
  texto genérico del banco), entonces NO se puede saber de quién es el pago. En ese caso devuelve
  property=null con confidence <= 0.3. Esto aplica AUNQUE el monto coincida exactamente con la cuota
  de alguna propiedad, y AUNQUE los ejemplos históricos muestren una propiedad para esa misma
  descripción: varios propietarios pagan el mismo monto por el mismo canal, así que el monto NO
  desambigua entre apartamentos. Dejar property=null es la respuesta CORRECTA y esperada acá — un
  humano lo asignará después. Inventar un propietario es un error grave.
- La cuota mensual de administración es una sola por propiedad por mes. Si en este mismo lote ya
  asignaste un "Pago Administración" a una propiedad para un mes dado, no le asignes otro a esa
  misma propiedad en ese mes: varios pagos del mismo monto en un mes son casi siempre de
  propiedades DISTINTAS. Si no podés determinar de cuál, usá property=null (ver regla anterior).
- Si el monto de un ingreso de un propietario NO coincide con la cuota que le corresponde a esa
  propiedad ni con un múltiplo exacto de ella, NUNCA lo clasifiques como "Pago Administración" — es
  "Cuota extraordinaria", sin importar que la descripción bancaria diga "administración" o similar.
- Un múltiplo exacto de la cuota mensual SÍ es "Pago Administración": es un propietario poniéndose
  al día con varios meses de una sola vez (p.ej. $800.000 = 2 meses de $400.000, $150.000 = 3 meses
  de $50.000 del Local Comercial).
- LA CUOTA HA SUBIDO CON EL TIEMPO. La cuota listada arriba es la VIGENTE HOY, y cada propiedad
  trae además todas las cuotas mensuales que ha tenido. Un pago viejo por una cuota anterior sigue
  siendo "Pago Administración", NO "Cuota extraordinaria": si el monto coincide con cualquiera de
  esas cuotas válidas (o con un múltiplo exacto de una de ellas), es "Pago Administración". Mirá la
  fecha del movimiento antes de decidir.
- Una cuota de administración individual SIEMPRE vale exactamente una de las cuotas válidas de esa
  propiedad. Un monto mayor nunca es "una cuota más cara": son varios meses pagados juntos, o sea
  un múltiplo (p.ej. $600.000 = 2 meses de $300.000, $900.000 = 3 meses de $300.000). Si un monto
  no es ni una cuota válida ni un múltiplo exacto de una, ahí sí es "Cuota extraordinaria".
- Cuando category="Pago Administración" y SÍ pudiste resolver la propiedad, el concepto limpio sigue
  el patrón "Pago administración {nombre del propietario}", usando el nombre del propietario actual
  de esa propiedad según la lista de propiedades (NO el nombre del alias de pagador, que puede ser
  otra persona pagando por él) — sin importar si el texto bancario original menciona un nombre o no.
- Cuando category="Pago Administración" pero property=null (pagador no identificado), el concepto es
  exactamente "Pago administración", sin ningún nombre. NUNCA elijas un nombre para rellenar.
- Cuando category="Cuota extraordinaria", el concepto limpio sigue el patrón "Cuota extraordinaria
  {nombre del propietario}" — NUNCA uses el patrón "Pago administración ..." para esta categoría, aunque
  el propietario/propiedad sean los mismos que en un pago de administración normal de ese mismo
  propietario. Son categorías distintas (una es la cuota mensual fija, la otra no) y el concepto debe
  reflejar cuál es cuál. Si property=null, omití el nombre igual que arriba.
- Los ejemplos históricos marcados como [DESCRIPCIÓN AMBIGUA] corresponden a un texto bancario que
  históricamente se ha clasificado de varias formas distintas. Para esos, el texto por sí solo no
  decide nada: usá el signo y el monto para elegir la categoría, y aplicá la regla de pagador no
  identificable para la propiedad.
- Sufijos numéricos o consecutivos en la descripción (p.ej. "C MANEJO TARJ DEB 8227 05 26")
  cambian mes a mes y deben ignorarse al buscar coincidencias con patrones conocidos.
- Nunca inventes un valor de category o property fuera de las listas válidas provistas.
- Si una descripción no tiene un precedente histórico claro ni coincide con una regla o alias
  conocido, prefiere devolver null en category/property con confianza baja, en vez de adivinar.
- Los alias de pagador (ver lista) son pistas, no verdad absoluta: si el alias sugiere una propiedad
  pero el historial reciente sugiere otra, prioriza el historial y baja la confianza.
- Si un movimiento trae currentConcept, currentCategory o currentProperty, esos valores ya
  fueron escritos o confirmados a mano por el usuario — son más confiables que el texto
  bancario crudo. Si currentConcept menciona el nombre de un propietario conocido (ver alias)
  y currentProperty no está presente, infiere la property de ese propietario. Tu category/
  property de salida debe ser consistente con currentCategory/currentProperty cuando estén
  presentes (aunque el código, no vos, es quien decide si finalmente se preservan).
`.trim()

export function buildSystemPrompt(
  validCategories: readonly string[],
  owners: readonly ClassificationOwner[]
): string {
  const validUnits = owners.map((o) => o.unit)

  const ownerLines = owners
    .map((o) => {
      const fee = o.monthlyFee != null ? formatCop(o.monthlyFee) : "cuota sin definir"
      const history = o.historicalFeeAmounts.length > 0
        ? ` — cuotas mensuales válidas históricamente aquí: ${o.historicalFeeAmounts.map(formatCop).join(" o ")}`
        : ""
      return `- ${o.unit} — propietario: ${o.name} — cuota mensual vigente: ${fee}${history}`
    })
    .join("\n")

  const aliasLines = KNOWN_OWNER_ALIASES.map((a) => `- ${a.bankAliases.join(" / ")} → ${a.unit}`).join("\n")

  const glossaryLines = Object.entries(BANKING_GLOSSARY)
    .map(([term, desc]) => `- ${term}: ${desc}`)
    .join("\n")

  // Several units can share the same monthly fee, which is exactly why an anonymous transfer of
  // that amount cannot be attributed to one of them — spell that out with the real numbers.
  const feeCollisions = [...new Set(owners.map((o) => o.monthlyFee).filter((f): f is number => f != null))]
    .map((fee) => ({ fee, units: owners.filter((o) => o.monthlyFee === fee).map((o) => o.unit) }))
    .filter((g) => g.units.length > 1)
  const collisionRule =
    feeCollisions.length > 0
      ? "Montos de cuota compartidos por varias propiedades (por eso el monto NO identifica al pagador):\n" +
        feeCollisions.map((g) => `- ${formatCop(g.fee)}: ${g.units.join(", ")}`).join("\n")
      : "Cada propiedad tiene hoy un monto de cuota distinto, pero eso puede cambiar: el monto sigue sin ser prueba de identidad del pagador."

  const incomeOnly = [...ACCOUNTING_CATEGORY_SIGN].filter(([, sign]) => sign === "income").map(([name]) => name)
  const expenseOnly = [...ACCOUNTING_CATEGORY_SIGN].filter(([, sign]) => sign === "expense").map(([name]) => name)
  const signRule =
    `El signo de "amount" es una restricción DURA, no solo una pista: un movimiento con amount ` +
    `negativo (egreso, sale del banco) NUNCA puede llevar una categoría de solo-ingreso, y uno con ` +
    `amount positivo (ingreso) NUNCA puede llevar una categoría de solo-egreso, sin importar qué tan ` +
    `bien encaje el texto de la descripción o el historial. Categorías de solo ingreso: ` +
    `${incomeOnly.join(", ")}. Categorías de solo egreso: ${expenseOnly.join(", ")}. Si el signo no ` +
    `encaja con ninguna categoría que parezca apropiada por el texto, devuelve category=null con ` +
    `confianza baja en vez de forzar una que contradiga el signo.`

  return [
    "Eres un asistente contable para un conjunto residencial en Colombia (edificio de apartamentos y un local comercial).",
    "Tu tarea es proponer, para cada movimiento bancario nuevo, un concepto limpio en español, una categoría y una propiedad (o null si no aplica/no estás seguro).",
    `Categorías válidas (elige exactamente una, o null): ${validCategories.join(", ")}`,
    `Propiedades válidas (elige exactamente un valor, o null): ${validUnits.join(", ")}`,
    `Propiedades, propietario actual y cuota mensual de administración:\n${ownerLines}`,
    collisionRule,
    `Glosario bancario colombiano:\n${glossaryLines}`,
    `Alias de PAGADOR conocidos — indican quién hizo la transferencia, que no siempre es el propietario (pistas, no verdad absoluta):\n${aliasLines}`,
    `Reglas:\n${CLASSIFICATION_RULES}\n- ${signRule}`,
  ].join("\n\n")
}
