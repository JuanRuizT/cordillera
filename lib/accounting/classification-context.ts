// Static, rarely-changing domain knowledge for the bank-movement classifier.
// Dynamic knowledge (recent already-categorized examples) lives in classify.ts instead.

import { OWNERS } from "../owners"

export const BANKING_GLOSSARY: Record<string, string> = {
  "4X1000": "Gravamen a los Movimientos Financieros — impuesto retenido automáticamente por el banco en transferencias. Categoría: Impuesto.",
  PSE: "Pagos Seguros en Línea — pasarela usada para pagar facturas/impuestos por transferencia (aparece como 'PAGO PSE ...').",
  CHEC: "Central Hidroeléctrica de Caldas, la empresa de energía. 'PAGO PSE Central Hidroelectri' = factura de energía. Categoría: Facturas.",
  DIAN: "Autoridad tributaria colombiana. 'PAGO PSE IMPUESTO DIAN' = retención/impuesto. Categoría: Impuesto.",
  LLAVE: "'PAGO LLAVE X' = transferencia interbancaria a un alias registrado por la persona X, no necesariamente su nombre completo.",
  "CUOTA MANEJO / TRJ DEB / MANEJO TARJ": "Cuota de manejo de tarjeta débito, cobrada mensualmente (el sufijo/consecutivo cambia cada mes). Categoría: Egreso.",
  NEQUI: "Billetera digital colombiana. 'TRANSFERENCIA DESDE NEQUI' NO identifica al pagador por nombre y NO es exclusiva de ningún propietario — cualquiera podría pagar por Nequi. Ver regla de cuotas de administración para cómo desambiguar por monto.",
}

export interface OwnerAliasHint {
  unit: string // must match Owner.unit exactly
  ownerName: string
  bankAliases: string[] // fragments seen after "PAGO LLAVE" or similar
}

// Hints only — NOT authoritative. A confirmed real transaction "PAGO LLAVE Juan Pablo" was
// actually property "Apartamento 301" (someone paying on that owner's behalf), so an alias
// match alone must not be trusted blindly. Weigh it against the historical examples provided
// at call time, and prefer lower confidence when they disagree or when there's no precedent.
export const KNOWN_OWNER_ALIASES: OwnerAliasHint[] = OWNERS
  .filter((o) => o.bankAliases.length > 0)
  .map((o) => ({ unit: o.unit, ownerName: o.name, bankAliases: o.bankAliases }))

// The monthly admin fee is a fixed amount per unit — anything else paid by an owner is an
// extraordinary fee, never the regular admin payment, regardless of what the description says.
// Apartments pay more than the commercial unit, which is smaller.
export const APARTMENT_ADMIN_FEE_AMOUNTS = [300_000, 400_000]
export const LOCAL_COMERCIAL_ADMIN_FEE_AMOUNT = 50_000

export const CLASSIFICATION_RULES = `
- La cuota mensual de administración es un valor fijo por propiedad: $${APARTMENT_ADMIN_FEE_AMOUNTS.join(" o $")}
  para los apartamentos, $${LOCAL_COMERCIAL_ADMIN_FEE_AMOUNT} para el Local Comercial (es una unidad más
  pequeña, paga menos). Si el monto de un ingreso de un propietario NO coincide exactamente con el
  valor que le corresponde a esa propiedad, NUNCA lo clasifiques como "Pago Administración" — es
  "Cuota extraordinaria", sin importar que la descripción bancaria diga "administración" o similar.
- Un ingreso de exactamente $${LOCAL_COMERCIAL_ADMIN_FEE_AMOUNT} sin ningún alias de otro propietario
  reconocible en la descripción (p.ej. "TRANSFERENCIA DESDE NEQUI") es, por defecto, la cuota de
  administración del Local Comercial — property="Local Comercial", category="Pago Administración".
  Pero si el texto SÍ menciona el alias de otro propietario, priorizá ese alias en cambio: Nequi no es
  exclusivo del Local Comercial.
- Cuando category="Pago Administración", el concepto limpio siempre sigue
  el patrón "Pago administración {nombre del propietario}", usando el nombre del propietario asociado
  a la propiedad resuelta (ver KNOWN_OWNER_ALIASES) — sin importar si el texto bancario original
  menciona su nombre o no. P.ej. una transferencia por Nequi atribuida al Local Comercial queda como
  "Pago administración Patricia Marín Álvarez", no como una descripción literal del medio de pago.
- Cuando category="Cuota extraordinaria", el concepto limpio sigue el patrón "Cuota extraordinaria
  {nombre del propietario}" — NUNCA uses el patrón "Pago administración ..." para esta categoría, aunque
  el propietario/propiedad sean los mismos que en un pago de administración normal de ese mismo
  propietario. Son categorías distintas (una es la cuota mensual fija, la otra no) y el concepto debe
  reflejar cuál es cuál.
- "TRANSFERENCIA CTA SUC VIRTUAL" y descripciones similares son ambiguas: se usan tanto para
  cuotas de administración entrantes, cuotas extraordinarias entrantes, como para pagos
  salientes a proveedores. Desambigua usando el monto, el signo (ingreso/egreso) y los
  ejemplos históricos — no confíes solo en el texto.
- Sufijos numéricos o consecutivos en la descripción (p.ej. "C MANEJO TARJ DEB 8227 05 26")
  cambian mes a mes y deben ignorarse al buscar coincidencias con patrones conocidos.
- Nunca inventes un valor de category o property fuera de las listas válidas provistas.
- Si una descripción no tiene un precedente histórico claro ni coincide con una regla o alias
  conocido, prefiere devolver null en category/property con confianza baja, en vez de adivinar.
- Los alias de propietario (KNOWN_OWNER_ALIASES) son pistas, no verdad absoluta: si el alias
  sugiere una propiedad pero el historial reciente sugiere otra, prioriza el historial y baja
  la confianza.
- Si un movimiento trae currentConcept, currentCategory o currentProperty, esos valores ya
  fueron escritos o confirmados a mano por el usuario — son más confiables que el texto
  bancario crudo. Si currentConcept menciona el nombre de un propietario conocido (ver alias)
  y currentProperty no está presente, infiere la property de ese propietario. Tu category/
  property de salida debe ser consistente con currentCategory/currentProperty cuando estén
  presentes (aunque el código, no vos, es quien decide si finalmente se preservan).
`.trim()

export function buildSystemPrompt(validCategories: readonly string[], validUnits: readonly string[]): string {
  const aliasLines = KNOWN_OWNER_ALIASES.map(
    (a) => `- ${a.bankAliases.join(" / ")} → ${a.unit} (${a.ownerName})`
  ).join("\n")

  const glossaryLines = Object.entries(BANKING_GLOSSARY)
    .map(([term, desc]) => `- ${term}: ${desc}`)
    .join("\n")

  return [
    "Eres un asistente contable para un conjunto residencial en Colombia (edificio de apartamentos y un local comercial).",
    "Tu tarea es proponer, para cada movimiento bancario nuevo, un concepto limpio en español, una categoría y una propiedad (o null si no aplica/no estás seguro).",
    `Categorías válidas (elige exactamente una, o null): ${validCategories.join(", ")}`,
    `Propiedades válidas (elige exactamente un valor, o null): ${validUnits.join(", ")}`,
    `Glosario bancario colombiano:\n${glossaryLines}`,
    `Alias de propietarios conocidos (pistas, no verdad absoluta):\n${aliasLines}`,
    `Reglas:\n${CLASSIFICATION_RULES}`,
  ].join("\n\n")
}
