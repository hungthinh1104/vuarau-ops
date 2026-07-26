# Repository map

Where things live and what may depend on what. Read this before deciding where a
change belongs.

```
apps/
  api/                          the only deployable backend
    src/
      modules/                  one folder per bounded module
        customer/               handlers + DTO mappers
        sale/
        payment/
        debt/
        shared/                 command pipeline, idempotency, authorization
      infrastructure/
        auth/                   JWT verification, principal resolution
        trpc/                   router, context, error mapping
        persistence/            port definitions + Drizzle and in-memory adapters
        clock.ts                the only source of `recordedAt`
        hash.ts                 canonical payload hashing for idempotency
      server.ts                 HTTP entry point
  web/                          placeholder — no UI in this phase

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
apps/api  ──▶ domain-kernel ──▶ domain-contracts
    │              ▲                  ▲
    └────────▶ db ─┴──────────────────┘
```

| Package            | May import                                                     | May **not** import                                                    |
| ------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| `domain-contracts` | `zod`                                                          | everything else                                                       |
| `domain-kernel`    | `domain-contracts`                                             | tRPC, Drizzle, Supabase, Next.js, React, HTTP, `node:*`, browser APIs |
| `db`               | `domain-contracts`, `domain-kernel`, `drizzle-orm`, `postgres` | `apps/*`, tRPC, Next.js, React                                        |
| `apps/api`         | all packages                                                   | `apps/web`                                                            |
| `test-fixtures`    | `domain-contracts`, `domain-kernel`                            | `db`, `apps/*`                                                        |

Enforced by `scripts/boundary-check.ts`, run as part of `pnpm verify`.

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

| Change                  | File                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| New rejection code      | `domain-contracts/src/shared/rejection-codes.ts` + `docs/04-business-rules/error-code-catalog.md` |
| New command             | `domain-contracts/src/<module>/index.ts`, then kernel, then handler, then router                  |
| A business rule changes | `domain-kernel/src/<module>/*.ts` + `docs/04-business-rules/` + its test                          |
| A new lifecycle state   | state catalog **first**, then the enum, then the kernel                                           |
| New table or column     | `db/src/schema/`, then `pnpm db:generate`, then `docs/07-data/data-model.md`                      |
| New query               | `db/src/repositories/` + a port in `apps/api/src/infrastructure/persistence/ports.ts`             |
| Anything touching money | kernel + docs + a P0 test. No exceptions.                                                         |

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
