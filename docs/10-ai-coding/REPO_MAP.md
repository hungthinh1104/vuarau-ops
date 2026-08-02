# Repository map

Where things live and what may depend on what. Read this after
[`docs/README.md`](../README.md), which is the canonical authority-order
definition. This file is the canonical dependency map; it describes the current
repository, not a desired future architecture.

## Runtime applications

```
apps/
  api/                                  deployable API process
    src/modules/<bounded-context>/      handlers, queries, effects and module tests
                                       including the append-only pricing catalog and resolver
    src/infrastructure/                auth, ports, persistence adapters, tRPC and logging
    src/operations/                    operator-only scripts and their app/db tests
    src/server.ts                      HTTP entry point

  web/                                  Next App Router application
    src/app/(app)/                     authenticated route tree: customers, sales, payments,
                                       purchases, suppliers, inventory, intake, delivery,
                                       pricing, reports, operations, quality and workspace surfaces
    src/app/auth/ and src/app/login/   authentication routes
    src/api/                           session, workspace, tRPC client and command identity
    src/offline/                       IndexedDB cache, sync engine and offline provider
    src/ui/primitives/                 reusable accessible controls and stories/tests
    src/ui/patterns/                   domain workflows, layouts and feedback states
    src/ui/domain/                     UI-only value/state transformations and presentation contracts
    src/ui/controllers/                route orchestration: params, queries, commands, offline and navigation
    src/ui/screens/                    route-level visual compositions; no API or offline imports
    src/fixtures/ and src/testing/     typed UI fixtures and test helpers
    e2e/                               Playwright real-stack specs and harness
    .storybook/                        Storybook configuration
```

The web app is not a shell or a demonstration route. It is the production Next
application and its Storybook catalogue. `pnpm web:build` produces the artefact
that E2E loads with `next start`; `pnpm web:storybook` builds the component/state
catalogue. The authenticated route root is `apps/web/src/app/(app)/`.

Every production `page.tsx` delegates to `apps/web/src/ui/controllers/`. A
controller owns route parameters, data loading, command identity, offline
coordination and navigation; it passes state and callbacks to a screen. Screens
compose patterns and primitives. Route files do not import API hooks or UI
primitives directly. `pnpm ui:check` and its regression tests enforce this
direction, including controller visual-composition boundaries and shared visual
tokens (Be Vietnam Pro, semantic colours and radius tokens). Storybook covers
representative screen and state compositions; `apps/web/e2e/ui-performance.spec.ts`
measures production-runtime p75 LCP, INP and CLS for the customer directory.
The root App Router also provides a shared loading skeleton and safe error
boundary; route-specific screens own their query, empty, permission and business
rejection states.

## E2E and validation surfaces

`apps/web/e2e/` contains the browser acceptance suite. Its harness owns API
readiness, seeded test data, signed-in sessions and the token bridge used by the
test build. The suite includes sign-in, quick sale, payment, account-ledger,
reconciliation, workspace administration, customer operations, offline quick
sale, operations, products, goods truth, depot operations and operational
correctness scenarios. Playwright runs mobile and desktop projects against a
real API and PostgreSQL process, and uses `next start`, not `next dev`. Representative
spec files include `apps/web/e2e/m13-offline-quick-sale.spec.ts` and
`apps/web/e2e/m23-operational-correctness.spec.ts`.

The repository checks are split by feedback speed:

| Command                               | Scope                                                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm test:fast`                      | domain, application, contract and web Vitest projects                                                          |
| `pnpm check:static`                   | format, lint, typecheck, boundaries, source, UI/docs/truth checks, context, trace and security-surface checks  |
| `pnpm verify`                         | static checks, all Vitest projects, Next build, Storybook build and production-runtime E2E                     |
| `pnpm context <query>`                | targeted docs/tests/implementation retrieval for an agent                                                      |
| `pnpm perf:m22` / `pnpm rehearse:m22` | disposable production-shape performance and fresh/idempotent migration evidence; both run as separate CI gates |

`pnpm context <folder>` is exhaustive for that active tracked folder by default;
ID and free-text queries use the normal result limits unless `--all` is passed.
All query types keep archive, generated-output, lockfile and migration-snapshot
exclusions.

## Packages and dependency boundaries

```
apps/api ───────────────▶ packages/db
   │                         │
   ├──────────────────────▶ domain-kernel ─────▶ domain-contracts
   └──────────────────────▶ domain-contracts

apps/web ───────────────▶ domain-contracts
packages/test-fixtures ─▶ domain-kernel ───────▶ domain-contracts
```

The graph above describes source/runtime direction. Workspace `devDependencies`
used only by tests or tooling do not grant production source permission. The
browser has two reviewed exceptions: `apps/web/src/api/trpc.ts` may import
`@vuarau/api` as `import type { AppRouter }`, and browser fixtures may import the
kernel-free `@vuarau/test-fixtures/ids` and `/time` subpaths.

| Package or source area          | May import                                                            | Must not import                                                                                      |
| ------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `packages/domain-contracts/src` | `zod`                                                                 | other workspace packages, frameworks, Node, browser APIs                                             |
| `packages/domain-kernel/src`    | `domain-contracts`                                                    | db, API, tRPC, Drizzle, Postgres, Supabase, Next, React, Node, Zod, test-fixtures in production code |
| `packages/db/src`               | `domain-contracts`, `domain-kernel`, Drizzle, Postgres                | anything from `apps/*`, tRPC, Next, React                                                            |
| `packages/test-fixtures/src`    | `domain-contracts`, `domain-kernel`                                   | db, anything from `apps/*`, transport/framework packages                                             |
| `apps/api/src`                  | workspace packages through ports/contracts and API infrastructure     | web, Next, React, direct Drizzle query-builder imports                                               |
| `apps/web/src`                  | domain-contracts, React, Next, tRPC client, approved fixture subpaths | db, domain-kernel, Drizzle, Postgres, `@trpc/server`, Node, API values                               |

These rules are enforced by `scripts/boundary-check.ts`. Source-size and
composition rules are enforced separately by `scripts/source-boundary-check.ts`
and its manifest. Do not infer a new boundary from this prose without updating
the checker and its regression tests.

## Package roles

| Package                     | Responsibility                                                                |
| --------------------------- | ----------------------------------------------------------------------------- |
| `packages/domain-contracts` | IDs, money, commands, DTOs, rejection codes and Zod schemas                   |
| `packages/domain-kernel`    | deterministic business decisions and state/effect calculations                |
| `packages/db`               | Drizzle schema, migrations, repositories, seeds and PostgreSQL test context   |
| `packages/test-fixtures`    | deterministic IDs, timestamps and shared test fixtures                        |
| `packages/config`           | shared TypeScript/Vitest configuration                                        |
| `scripts/`                  | repository checks, dev orchestration, context retrieval and operator dry-runs |

The root script entry points are implemented in `scripts/dev.ts`,
`scripts/context.ts`, `scripts/docs-check.ts`, `scripts/trace-check.ts`,
`scripts/m24-policy-closure.ts`,
`scripts/repository-truth-check.ts`, `scripts/boundary-check.ts`,
`scripts/source-boundary-check.ts`, `scripts/m22-security-check.ts` and
`scripts/m23-pilot-dry-run.ts`.

## Where does my change go?

| Change                  | File or first boundary                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| New rejection code      | `packages/domain-contracts/src/shared/rejection-codes.ts` + `docs/04-business-rules/error-code-catalog.md` |
| New command             | `packages/domain-contracts/src/<module>/`, then kernel, handler, router                                    |
| Business rule change    | `packages/domain-kernel/src/<module>/` + business-rule doc + test                                          |
| New lifecycle state     | state catalog first, then contract/kernel and transition catalog                                           |
| New table or column     | `packages/db/src/schema/`, `pnpm db:generate`, backup/restore coverage, then data-model docs               |
| Price rule behavior     | `packages/domain-contracts/src/pricing/`, `packages/domain-kernel/src/pricing/`, API pricing module        |
| New query               | `packages/db/src/repositories/` + a port in `apps/api/src/infrastructure/persistence/`                     |
| New UI state            | `docs/06-api-contracts/ui-state-catalog.md` first, then `apps/web/src/ui/` and a story/test                |
| New UI screen/flow      | matching `apps/web/src/app/`, `src/ui/patterns/` or `src/ui/screens/` surface + tests/E2E where applicable |
| Operator tool           | `apps/api/src/operations/` + an `ops:*` script; never a tRPC procedure                                     |
| Agent context retrieval | `scripts/context.ts`, with regression tests in `scripts/context.test.ts`                                   |
| Anything touching money | kernel + docs + a P0 test                                                                                  |

## Forbidden shapes

No `utils/`, `helpers/`, `common/`, `misc/`, `types/`, or `services/` folders. A
shared module needs a name that says what it is responsible for —
`command-pipeline.ts`, `money.ts`, `clock.ts` — not what it is not.

## Related

- [CHANGE_PROTOCOL.md](CHANGE_PROTOCOL.md), [REVIEW_CHECKLIST.md](REVIEW_CHECKLIST.md)
- [../01-domain/context-map.md](../01-domain/context-map.md)
