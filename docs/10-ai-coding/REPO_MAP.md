# Repository map

Where things live and what may depend on what. Read this before deciding where a
change belongs.

```
apps/
  api/                          the only deployable backend
    src/
      modules/                  one folder per bounded module
        customer/               handlers + DTO mappers
        sale/                   draft, post, void
        payment/
        account/                balance and timeline reads
        shared/                 command pipeline, idempotency, authorization
      infrastructure/
        auth/                   JWT verification, principal resolution
        trpc/                   router, context, error mapping
        persistence/            port definitions + Drizzle and in-memory adapters
        clock.ts                the only source of `recordedAt`
        hash.ts                 canonical payload hashing for idempotency
      server.ts                 HTTP entry point
  web/                          Next App Router — design system and Storybook only
    src/
      app/                      routes: the shell, and one demonstration route
      api/                      tRPC client, session bootstrap, command identity
      ui/                       primitives/, patterns/, format.ts, copy.ts
      fixtures/                 typed sample data, parsed through published schemas
      testing/                  Vitest setup, axe helper
    e2e/                        Playwright skeleton
    .storybook/                 react-vite builder

packages/
  domain-contracts/             shapes only: ids, money, commands, DTOs, codes
  domain-kernel/                pure business decisions — no framework, no I/O
  db/                           Drizzle schema, migrations, repositories, seeds
  test-fixtures/                deterministic fixtures shared by all test projects
  config/                       tsconfig base + shared Vitest settings

docs/                           see docs/10-ai-coding/CHANGE_PROTOCOL.md
scripts/                        boundary-check, trace-check, docs-check
```

## Dependency rules

```
apps/api  ──▶ domain-kernel ──▶ domain-contracts ◀── apps/web
    │              ▲                  ▲
    └────────▶ db ─┴──────────────────┘
```

| Package            | May import                                                     | May **not** import                                                         |
| ------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `domain-contracts` | `zod`                                                          | everything else                                                            |
| `domain-kernel`    | `domain-contracts`                                             | tRPC, Drizzle, Supabase, Next.js, React, HTTP, `node:*`, browser APIs      |
| `db`               | `domain-contracts`, `domain-kernel`, `drizzle-orm`, `postgres` | `apps/*`, tRPC, Next.js, React                                             |
| `apps/api`         | all packages                                                   | `apps/web`                                                                 |
| `apps/web`         | `domain-contracts`, React, Next, tRPC **client**               | `db`, `domain-kernel`, `drizzle-orm`, `postgres`, `@trpc/server`, `node:*` |
| `test-fixtures`    | `domain-contracts`, `domain-kernel`                            | `db`, `apps/*`                                                             |

Enforced by `scripts/boundary-check.ts`, run as part of `pnpm verify`.

### The browser's two narrow exceptions

`apps/web` names `@vuarau/api` in exactly one file,
`apps/web/src/api/trpc.ts`, and only as `import type { AppRouter }`. The type is
erased before a bundler sees it, which is what gives the client full inference with
no code generation step — and is safe exactly as long as no value crosses. The rule
is therefore "import it in one file", not "never import it", so the `import type`
sits somewhere a reviewer will see it.

It also imports `@vuarau/test-fixtures/ids` and `/time` — the two modules that
depend on nothing but contracts — for its browser fixtures. The package's barrel is
forbidden, because it re-exports fixtures built on the domain kernel.

`db` → `domain-kernel` is allowed and points the right way: persistence maps rows
to domain state, and the domain knows nothing about persistence. What `db` may
**not** do is import `apps/api` — the application layer declares the repository
ports, and the Drizzle implementations satisfy them _structurally_, so the arrow
can never invert. If a port and an implementation drift, the wiring in `apps/api`
stops compiling.

`apps/api` may not import `drizzle-orm` either. It reaches persistence only
through ports; a handler or a test that reached for the query builder would be the
first crack in that.

## Where does my change go?

| Change                  | File                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| New rejection code      | `domain-contracts/src/shared/rejection-codes.ts` + `docs/04-business-rules/error-code-catalog.md`            |
| New command             | `domain-contracts/src/<module>/index.ts`, then kernel, then handler, then router                             |
| A business rule changes | `domain-kernel/src/<module>/*.ts` + `docs/04-business-rules/` + its test                                     |
| A new lifecycle state   | state catalog **first**, then the enum, then the kernel                                                      |
| New table or column     | `db/src/schema/`, then `pnpm db:generate`, then `docs/07-data/data-model.md`                                 |
| New query               | `db/src/repositories/` + a port in `apps/api/src/infrastructure/persistence/ports.ts`                        |
| A new UI state          | `docs/06-api-contracts/ui-state-catalog.md` **first**, then `apps/web/src/ui/catalog-state.ts`, then a story |
| A new component         | `apps/web/src/ui/primitives/` or `patterns/` + a story + a test of the rule it encodes                       |
| Anything touching money | kernel + docs + a P0 test. No exceptions.                                                                    |

## Forbidden shapes

No `utils/`, `helpers/`, `common/`, `misc/`, `types/`, or `services/` folders. A
shared module needs a name that says what it is responsible for —
`command-pipeline.ts`, `money.ts`, `clock.ts` — not what it is not.

## Commands

```bash
pnpm install
pnpm verify           # format, lint, typecheck, boundaries, docs, trace, tests
pnpm test:domain      # fastest useful signal
pnpm db:migrate       # needs DATABASE_URL
```

## Related

- [CHANGE_PROTOCOL.md](CHANGE_PROTOCOL.md), [REVIEW_CHECKLIST.md](REVIEW_CHECKLIST.md)
- [../01-domain/context-map.md](../01-domain/context-map.md)
