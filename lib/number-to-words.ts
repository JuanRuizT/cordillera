const ONES: Record<number, string> = {
  1: "uno", 2: "dos", 3: "tres", 4: "cuatro", 5: "cinco",
  6: "seis", 7: "siete", 8: "ocho", 9: "nueve", 10: "diez",
  11: "once", 12: "doce", 13: "trece", 14: "catorce", 15: "quince",
  16: "dieciséis", 17: "diecisiete", 18: "dieciocho", 19: "diecinueve",
  20: "veinte", 21: "veintiuno", 22: "veintidós", 23: "veintitrés",
  24: "veinticuatro", 25: "veinticinco", 26: "veintiséis",
  27: "veintisiete", 28: "veintiocho", 29: "veintinueve",
}

const TENS: Record<number, string> = {
  3: "treinta", 4: "cuarenta", 5: "cincuenta",
  6: "sesenta", 7: "setenta", 8: "ochenta", 9: "noventa",
}

const HUNDREDS: Record<number, string> = {
  2: "doscientos", 3: "trescientos", 4: "cuatrocientos",
  5: "quinientos", 6: "seiscientos", 7: "setecientos",
  8: "ochocientos", 9: "novecientos",
}

function belowThousand(n: number): string {
  if (n <= 0) return ""
  const h = Math.floor(n / 100)
  const rem = n % 100
  const parts: string[] = []

  if (h > 0) {
    if (h === 1) parts.push(rem > 0 ? "ciento" : "cien")
    else parts.push(HUNDREDS[h])
  }

  if (rem > 0) {
    if (rem <= 29) {
      parts.push(ONES[rem])
    } else {
      const t = Math.floor(rem / 10)
      const o = rem % 10
      parts.push(o > 0 ? `${TENS[t]} y ${ONES[o]}` : TENS[t])
    }
  }

  return parts.join(" ")
}

export function numberToWords(n: number): string {
  n = Math.floor(n)
  if (n === 0) return "cero pesos"

  const millions = Math.floor(n / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1_000)
  const remainder = n % 1_000

  const parts: string[] = []

  if (millions > 0) {
    parts.push(millions === 1 ? "un millón" : `${belowThousand(millions)} millones`)
  }
  if (thousands > 0) {
    parts.push(thousands === 1 ? "mil" : `${belowThousand(thousands)} mil`)
  }
  if (remainder > 0) {
    parts.push(belowThousand(remainder))
  }

  return parts.join(" ").trim() + " pesos"
}
