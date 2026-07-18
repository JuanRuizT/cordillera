// Gemini models every AI feature uses (bank statement classification, cuentas de cobro and facturas
// extraction), tried in order. trackedGenerateObject moves on to the next one when a model is
// saturated (503 "high demand"), rate-limited, times out, or is no longer served — instead of failing
// the whole call. Change the models here only, and add each one's rates to MODEL_PRICING in
// ./pricing.ts, or its calls are logged with no cost.
export const GEMINI_MODEL_CHAIN = ["gemini-3.6-flash", "gemini-3.5-flash"] as const
