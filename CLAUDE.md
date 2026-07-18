# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project Overview

Cordillera is a property/building administration app for a residential building in Colombia (Spanish-language UI). Despite the README's description ("Todo app"), the Todo feature (`app/todos/`) is legacy scaffolding — the real application is an accounting and administration system covering:

- **Owners & fees** (`Owner` model): apartment/garage coefficients and monthly HOA fees ("cuota de administración").
- **Bank statement ingestion** (`app/bank-statements/`, `lib/bank-statements/`): upload Excel statements, parse movements, store in GCS.
- **AI-assisted accounting** (`app/accounting/`, `lib/accounting/`): classifies bank movements into concept/category/property using Gemini, generates cash receipts ("recibos de caja") and expense vouchers ("comprobantes de egreso") as PDFs, and produces compliance certificates ("Paz y Salvo").
- **Contractors & invoices** (`app/contractors/`, `app/invoices/`): contractor records, invoices ("cuentas de cobro"), partial payments ("abonos"), AI-based invoice data extraction.
- **AI usage tracking** (`app/ai-usage/`, `lib/ai/`): every LLM call is logged with token usage and estimated cost via `AiCallLog`.
- **RAG demo** (`app/demo-rag/`, `lib/rag/`): PDF ingestion, embeddings, vector search, chat — a separate/experimental feature, not integrated with the accounting domain.

## Commands

```bash
npm run dev            # start dev server (Turbopack), http://localhost:3000
npm run build           # production build
npm run start           # run production build
npm run lint             # eslint .
npm run lint:fix
npm run format            # prettier --write .
npm run format:check

npm run db:generate       # prisma generate (also runs on postinstall)
npm run db:migrate         # prisma migrate dev
npm run db:push            # prisma db push (no migration history)
npm run db:studio           # Prisma Studio
```

There is no test suite configured in this repo (no `test` script, no test files). Don't assume Jest/Vitest exists — verify behavior via `npm run build`/`lint` and manual/browser checks instead.

## Architecture

### Next.js conventions (read `AGENTS.md` note above — this is a pre-release Next.js with breaking changes)

- Route protection is implemented in **`proxy.ts`** at the repo root, not `middleware.ts`. It calls `auth()` and redirects based on a hardcoded `protectedRoutes`/`publicRoutes` list — update that list when adding new top-level routes that need auth gating.
- Check `node_modules/next/dist/docs/` before relying on trained-in Next.js knowledge for App Router APIs.

### Auth

- NextAuth v5 (beta), configured in `auth.ts` at the repo root. Credentials provider only (email/password via bcrypt), JWT session strategy, `PrismaAdapter`.
- Server Actions get the current user via `auth()` → look up `prisma.user.findUnique({ where: { email: session.user.email } })`, then `redirect("/login")` if absent. This pattern is repeated per-action (see `app/accounting/actions.ts`) rather than centralized — follow the existing pattern rather than introducing a new auth helper unless asked.

### Database (Prisma 7 + Neon)

- Prisma client is generated to a **custom path**: `generated/prisma` (not `node_modules/.prisma`), per `prisma/schema.prisma`'s `generator client` block. Import it via `@/generated/prisma/client`, not `@prisma/client`.
- Connects through `@prisma/adapter-neon` (driver adapter), instantiated once in `lib/db.ts` with the standard Next.js dev-mode global-singleton pattern.
- Two DB URLs: `DATABASE_URL` (used by the Neon adapter at runtime) and `DIRECT_URL` (used by `prisma.config.ts` for migrations).
- `FinancialAccount` is deliberately not named `Account` — that name is reserved for NextAuth's OAuth `Account` model.
- Money fields are `Decimal` (`@db.Decimal(15, 2)` etc.) — don't convert to JS `number` for storage/precision-sensitive math; see `lib/currency.ts` / `lib/invoice-financials.ts` for existing helpers.
- Several fields track human-confirmation state per-field (e.g. `AccountingRecord.conceptConfirmed/categoryConfirmed/propertyConfirmed`) so AI reclassification never silently overwrites a value a human has confirmed. Preserve this semantic when touching classification/reclassification code.

### Feature module layout

Each domain feature lives under `app/<feature>/` with colocated `page.tsx`, `actions.ts` (Server Actions, `"use server"`), and feature-specific components — components are not extracted to a shared location unless genuinely generic (those live in `components/ui/`, shadcn "new-york" style). Domain logic that isn't a Server Action itself lives in `lib/<feature>/`.

### File storage (Google Cloud Storage)

- Most features (`accounting`, `contractors`, `invoices`, `rag`) share **one bucket** via the generic `GOOGLE_CLOUD_BUCKET_NAME` / `GOOGLE_CLOUD_PROJECT_ID` / `GOOGLE_CLOUD_SA_KEY` env vars.
- `bank-statements` (and the admin signature asset in `lib/signature.ts`) use a **separate, dedicated** bucket via `BANK_STATEMENTS_GCS_*` env vars — don't assume all `lib/*/gcs.ts` modules point at the same bucket.
- The service account key is stored base64-encoded in the env var and decoded at call time (`JSON.parse(Buffer.from(saKeyBase64, "base64").toString("utf-8"))`) — follow this convention for any new GCS-backed feature rather than reading a key file from disk.

### AI calls (Vercel AI SDK + Gemini)

- All structured-output LLM calls go through `trackedGenerateObject` (`lib/ai/tracked-generate-object.ts`), a thin wrapper around the AI SDK's `generateObject` that measures duration, captures token usage, estimates cost (`lib/ai/pricing.ts`), and writes an `AiCallLog` row — even on failure. Use it instead of calling `generateObject` directly so cost/usage tracking stays complete.
- Current model in use: `gemini-3.1-flash-lite` via `@ai-sdk/google`.
- Classification prompts are built dynamically from `ACCOUNTING_CATEGORIES` (`lib/accounting/categories.ts`) and historical confirmed records (few-shot examples) — category/property values returned by the model are always re-validated against the known valid list server-side before being trusted (defense in depth against hallucinated categories/units).

## Language

UI copy, form labels, and domain terminology (categories, error messages) are in Spanish. Match existing terminology (e.g. "cuota de administración", "cuenta de cobro", "Paz y Salvo") rather than translating when adding related features.
