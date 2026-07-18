// Today's date as "YYYY-MM-DD", pinned to Bogotá local time regardless of where this runs —
// the server may run in UTC (e.g. Vercel), and `new Date().toISOString().slice(0, 10)` silently
// returns the UTC calendar day, which is already "tomorrow" from ~7pm Bogotá time onward. This
// building's admin is always in Colombia, so hardcoding the timezone (rather than trusting the
// client machine's OS setting) keeps server- and client-generated filenames consistent.
export function todayStamp(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())
}
