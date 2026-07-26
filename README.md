# vuarau-ops

Operational decision system for wholesale vegetable depots (vựa rau) in Vietnam.

Depot owners and workers need to record sales and payments in seconds, on 4G that
drops, and then trust the debt totals that come out. The system is built around
that: every write is a named business command, every đồng of debt traces to a
person and a request, and mistakes are corrected by compensating records rather
than by editing history.

**Status: shadow pilot readiness.** The vertical slice runs end to end —
customer → sale → customer account → payment → reversal → audit — and two of those
workflows have production screens: **record a payment** and **quick sale**. Sign-in
is Supabase; the depot list comes from the server.

Nobody has recorded a real sale in this software. Every claim about speed or
usability is an intention rather than a measurement
([validation-plan.md](docs/00-product/validation-plan.md)).

## Quick start

```bash
pnpm install
pnpm verify          # the full quality gate
```

`pnpm verify` runs format, lint, typecheck, architectural boundaries, docs
validation, traceability, and all test projects.

### With a database

The database and end-to-end suites skip when `DATABASE_URL` is unset — and **fail
rather than skip when `CI` is set**, because a green build that asserted nothing
about Postgres is worse than a red one. To run them locally:

```bash
docker run -d --name vuarau-ops-dev-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=vuarau_test \
  -p 55432:5432 postgres:17-alpine

cp .env.example .env
export DATABASE_URL=postgres://postgres:postgres@localhost:55432/vuarau_test

pnpm db:migrate
pnpm db:seed
pnpm test:db
```

## Commands

| Command                                       | What it does                                          |
| --------------------------------------------- | ----------------------------------------------------- |
| `pnpm verify`                                 | The full gate. Run this before pushing.               |
| `pnpm lint` / `pnpm format`                   | ESLint / Prettier                                     |
| `pnpm typecheck`                              | `tsc --noEmit` across the workspace                   |
| `pnpm test`                                   | All five Vitest projects                              |
| `pnpm test:domain`                            | Pure decision functions — no I/O, milliseconds        |
| `pnpm test:application`                       | Command handlers over in-memory ports                 |
| `pnpm test:contract`                          | tRPC procedures and DTO shapes                        |
| `pnpm test:db`                                | Real Postgres; skipped locally without `DATABASE_URL` |
| `pnpm test:web`                               | Components and stories, in jsdom                      |
| `pnpm web:build` / `web:storybook`            | Next production build / Storybook build               |
| `pnpm web:e2e`                                | Playwright: real browser, real API, real Postgres     |
| `pnpm boundary:check`                         | Architectural import boundaries                       |
| `pnpm trace:check`                            | use case → rule → case → test → implementation        |
| `pnpm docs:check`                             | Required docs, link resolution, unique IDs            |
| `pnpm db:generate` / `db:migrate` / `db:seed` | Drizzle migrations and seed data                      |

## Layout

```
apps/
  api/                    the backend (tRPC, command handlers, adapters, operator tools)
  web/                    the web app (Next App Router, design system, Storybook)
packages/
  domain-contracts/       ids, money, commands, DTOs, rejection codes
  domain-kernel/          pure business decisions, framework-free
  db/                     Drizzle schema, migrations, repositories
  test-fixtures/          deterministic fixtures
  config/                 shared TypeScript and Vitest configuration
docs/                     the specification — see docs/10-ai-coding/REPO_MAP.md
scripts/                  boundary-check, trace-check, docs-check
```

## Design in one page

- **Debt is a ledger, not a number.** `customer_account_entries` is append-only and is
  the source of truth; the balance is a rebuildable projection. Corrections are
  compensating entries — nothing is edited or deleted
  ([ADR-0004](docs/09-decisions/ADR-0004-append-only-debt-ledger.md)).
- **Every write is a named command** carrying an idempotency key, an actor, a
  workspace, and the time the event actually happened. Retrying is safe by
  construction ([ADR-0002](docs/09-decisions/ADR-0002-command-based-writes.md),
  [ADR-0008](docs/09-decisions/ADR-0008-idempotency-records.md)).
- **Two timestamps, always.** A sale at 05:00 entered at 11:00 ages from 05:00 and
  audits at 11:00 ([ADR-0007](docs/09-decisions/ADR-0007-explicit-transaction-and-recorded-time.md)).
- **Money is integers.** VND minor units, `bigint` in Postgres. No floating point
  anywhere ([ADR-0006](docs/09-decisions/ADR-0006-integer-minor-units-for-money.md)).
- **The backend owns the rules.** The frontend gets typed contracts and
  server-computed capabilities, never its own copy of a rule
  ([ADR-0003](docs/09-decisions/ADR-0003-backend-owns-business-rules.md)).

## Stack

Node 24 · TypeScript (strict) · pnpm workspaces · Zod · tRPC v11 · Drizzle ORM ·
PostgreSQL 17 (Supabase-compatible) · Vitest · Next 15 · React 19 · Tailwind v4 ·
Storybook · Playwright · Supabase authentication.

TypeScript runs directly under Node — there is no build step for the backend.

## Documentation

Documentation is the specification and is verified in CI
([ADR-0005](docs/09-decisions/ADR-0005-markdown-docs-as-source-of-truth.md)).

Start with [docs/10-ai-coding/REPO_MAP.md](docs/10-ai-coding/REPO_MAP.md), then
[docs/00-product/product-brief.md](docs/00-product/product-brief.md).
Contributors — human or AI — follow
[docs/10-ai-coding/CHANGE_PROTOCOL.md](docs/10-ai-coding/CHANGE_PROTOCOL.md).

Preparing a depot for an observed session:
[pilot-mode.md](docs/00-product/pilot-mode.md) says what the pilot is and is not,
[pilot-onboarding.md](docs/00-product/pilot-onboarding.md) sets it up.

Unresolved business policy is tracked openly in
[docs/09-decisions/decision-backlog.md](docs/09-decisions/decision-backlog.md).
Nothing there has been silently decided.
