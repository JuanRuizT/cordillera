// Monthly admin fee history (OwnerFee): helpers shared by the Paz y Salvo page and its actions.

export type FeeStep = { fromMonth: string; amount: number } // fromMonth: "YYYY-MM"

/**
 * The fee in effect for a "YYYY-MM" month: the latest step starting on or before it. null when no
 * step has started yet — that month isn't charged at all.
 */
export function feeInEffect(steps: readonly FeeStep[], month: string): number | null {
  let fee: number | null = null
  let from = ""
  for (const s of steps) {
    if (s.fromMonth <= month && s.fromMonth >= from) {
      fee = s.amount
      from = s.fromMonth
    }
  }
  return fee
}

/**
 * The current month ("YYYY-MM") in the building's timezone. `toISOString()` is UTC, which would roll
 * the month over five hours early on the last day of each month.
 */
export function currentMonthInColombia(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }).slice(0, 7)
}
