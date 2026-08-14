# Test strategy

## Five projects, five failure modes

Configured in `vitest.config.ts`.

| Project       | Command                 | Scope                                                                                          | Needs          |
| ------------- | ----------------------- | ---------------------------------------------------------------------------------------------- | -------------- |
| `domain`      | `pnpm test:domain`      | Pure decision functions in `packages/domain-kernel` and schemas in `packages/domain-contracts` | nothing        |
| `application` | `pnpm test:application` | Command handlers over in-memory ports (`apps/api/**/*.app.test.ts`)                            | nothing        |
| `contract`    | `pnpm test:contract`    | tRPC caller round-trips and DTO shape (`apps/api/**/*.contract.test.ts`)                       | nothing        |
| `db`          | `pnpm test:db`          | Real Postgres: migrations, repositories, constraints, triggers (`packages/db/**/*.db.test.ts`) | `DATABASE_URL` |
| `web`         | `pnpm test:web`         | Components over fixed DTOs, in jsdom (`apps/web/**/*.test.ts{,x}`)                             | nothing        |

## Validation tiers

Choose the smallest validation scope that can disprove the current change. Batch
related implementation edits first, then run one validation batch; this keeps the
feedback loop useful without repeatedly booting every project. `pnpm verify`
remains the merge gate, not the default edit loop.

| Stage         | Command                                                     | When                           |
| ------------- | ----------------------------------------------------------- | ------------------------------ |
| Edit loop     | exact file or `pnpm test:focus -t TC-*`                     | after a related batch of edits |
| Affected loop | `pnpm test:related <changed-file>` or a project command     | after the batch is complete    |
| Commit gate   | `pnpm validate:commit` plus focused DB evidence when needed | before commit                  |
| Merge gate    | `pnpm verify`                                               | before PR or merge             |

`pnpm test:fast` runs the domain, application, contract and web projects in one
Vitest invocation. It intentionally excludes the Postgres project; add
`pnpm test:db <focused-file>` when the change touches schema, migrations,
repositories, transactions, row mappers, SQL aggregates, backup/restore or a
persistence adapter.

`pnpm test:release` is the release-gate variant: it runs the four non-Postgres
projects first, then invokes `pnpm test:db`. This prevents the release gate from
running DB tests directly against the shared `DATABASE_URL`; the DB wrapper
creates and removes its own local disposable target.

### Changed area decision table

| Changed area             | Required local validation                          |
| ------------------------ | -------------------------------------------------- |
| `domain-kernel`          | focused test + `pnpm test:domain`                  |
| application handler      | focused application test + `pnpm test:application` |
| tRPC/schema/DTO          | contract test + `pnpm test:contract`               |
| repository/schema/mapper | focused DB test + `pnpm test:db` before merge      |
| React component          | focused web test + `pnpm test:web`                 |
| route/user journey       | focused web test + relevant E2E smoke              |
| docs only                | docs/truth/trace checks                            |
| shared config            | `pnpm check:static` + all affected projects        |

Only `db` needs anything. That is a direct consequence of ADR-0003: a pure kernel
is a fast test suite, and a UI that renders server-computed answers can be tested
against fixtures rather than against a server.

### What the `web` project is for

Not "does the component render" — that is what a snapshot would tell you, and it
tells you nothing when it changes. Each web test names a way this product can
mislead somebody about money: a credit rendered as a debt, a placeholder zero read
as a balance, a stale version silently retried, an idempotency key regenerated on
resend. The tests are named `TC-WEB-*` and listed in
[trace-map.yml](trace-map.yml) under `contract_tests`.

They are **not** attached to business rules, and that is deliberate. A business
rule is satisfied by the server; a screen that renders it wrongly does not make the
rule unmet, it makes the screen a liar. Filing these under BR-\* entries would let
"UI shipped" read as "rule implemented".

Nothing in the `web` project touches the network. Every story and every test uses a
fixture from `apps/web/src/fixtures`, and TC-WEB-001 parses each of those through
the schema the server validates with — so the fixtures cannot drift from the API
without failing.

## Database tests

`pnpm test:db` loads the root `.env` when it exists, then creates a fresh local
database whose name ends in `_test`, runs migrations and drops it after the
suite. The configured database is used only as the local PostgreSQL source; its
existing rows are never part of the test run. Environment variables already
present in the shell still win, which is how CI supplies its service-container
URL.

`pnpm test:db` **skips** its suites when `DATABASE_URL` is unset rather than
failing, so a laptop without Postgres still gets a green `pnpm verify`. Skipped is
reported as skipped — the summary says so.

**Except under CI, where it fails instead.** `skipWithoutDatabase()` throws when
`DATABASE_URL` is absent and `CI` is set, and `endToEndDisabled()` does the same
for Playwright — early enough that it throws while the config loads, before a spec
is collected.

The distinction is not fussiness. On a laptop a skip is a convenience. In CI it is
a lie: the build goes green having asserted nothing about Postgres, and the way
that is discovered is a production incident whose test "passed" every day since the
workflow variable was renamed. Both guards are one line of workflow away from
mattering, and nothing else would notice.

To run them locally:

```bash
docker run -d --name vuarau-ops-dev-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=vuarau_test \
  -p 55432:5432 postgres:17-alpine

export DATABASE_URL=postgres://postgres:postgres@localhost:55432/vuarau_test
pnpm test:db
```

CI runs a `postgres:17` service container. `pnpm test:db` creates a second
disposable database inside that service, so migrations apply from scratch on
every push and stale rows cannot mask or block the suite.

The repository migration runner reconciles the migration table by content hash in
journal order, not only by the newest folder timestamp. This keeps an existing
database from silently skipping a migration generated on a parallel branch; an
unknown migration hash fails closed.

Playwright owns its API and Next production processes and normally uses ports
`3102` and `3101`. To run the production-shaped E2E artifact while a local dev
server is already running, choose isolated ports for both the build and test:

```bash
E2E_API_PORT=3202 E2E_WEB_PORT=3201 pnpm web:e2e:build
E2E_API_PORT=3202 E2E_WEB_PORT=3201 pnpm web:e2e
```

The root `pnpm web:e2e` wrapper also creates a fresh
`vuarau_e2e_<sha>_<nonce>_test` database from the local `_test` source and drops
it with `FORCE` after the browser run. This keeps browser E2E data separate from
the functional DB test target. The pilot dry-run is the only caller allowed to
set its own target, because it intentionally runs the browser against the same
SHA-scoped database as the rest of that rehearsal.

The override is validated as a TCP port and the two ports must differ.

Each database test creates its **own workspace UUID** and asserts only within it.
No truncation between files, no shared fixture state, and files can run in
parallel. As a side effect, every database test is also a small workspace-isolation
test.

## Principles

**Real objects over mocks.** Application tests use in-memory repository
implementations of the same ports the Drizzle adapters implement — not
`vi.fn()` stubs. A test that asserts "the repository was called with X" passes when
the repository does the wrong thing with X.

**Behaviour, not internals.** Tests assert on returned DTOs, ledger entries, and
balances. No test reaches into a private field or asserts call counts on internal
helpers.

**Deterministic fixtures.** `@vuarau/test-fixtures` exports fixed UUIDs and fixed
timestamps. No `Math.random()`, no `new Date()`, no faker. A test that fails
should fail every time.

**Exact integers.** Money assertions compare exact minor-unit integers. There is no
tolerance-based comparison anywhere, because there is no floating point anywhere.

**Unresolved-state parity.** The Operations Board tests the shared deriver against
ordinary workflow facts, the outstanding-delivery and incomplete-receiving source
conditions, the overdue-receivable due-date source, each canonical
unresolved source fact, and the exact integer amount/options exposed to the worker.
Repository tests must prove that PostgreSQL page rows, filters and counts use the
same seven exception keys; application tests must prove that resolving an
unallocated Payment removes the condition without a goods-side effect. Browser E2E
must cover the real loop: record Payment, observe a blocking close summary and
Board exception, allocate through the authorized command, then observe the
exception and blocker disappear.

**Test names carry IDs.**

```ts
describe("BR-PAYMENT-003 / TC-PAYMENT-007", () => { … });
```

This is what makes [traceability](traceability.md) mechanical.

**Shared contracts run against each persistence adapter.** Repository contracts
are written once in `apps/api/src/testing/adapter-contracts.ts`, then exercised
against the in-memory and PostgreSQL adapters. This is the parity boundary: an
application test proves command behavior quickly, while the database project
proves SQL paging, scoping and constraints on the real driver.

**Property/model tests probe invariants, not implementation details.** Generated
sequences cover integer money arithmetic, receipt limits, idempotency and
workspace isolation. They use deterministic generators rather than an unbounded
random seed, so a failure remains reproducible.

## The ten required tests

| #   | Behaviour                                                                    | Test                        | Project     |
| --- | ---------------------------------------------------------------------------- | --------------------------- | ----------- |
| 1   | Confirming a valid order produces exactly one customer account ledger effect | TC-SALE-003                 | domain      |
| 2   | Repeating the same confirm command does not duplicate debt                   | TC-SALE-004                 | application |
| 3   | Recording a payment reduces debt exactly once                                | TC-PAYMENT-001              | application |
| 4   | Repeating the same payment command returns the original result               | TC-PAYMENT-002              | application |
| 5   | Reusing an idempotency key with a different payload is rejected              | TC-COMMAND-002              | application |
| 6   | Reversing a payment creates a compensating ledger effect                     | TC-PAYMENT-004              | domain      |
| 7   | Repeating the same reversal does not create another effect                   | TC-PAYMENT-005              | application |
| 8   | Debt summary equals the sum of effective ledger entries                      | TC-ACCOUNT-001              | domain      |
| 9   | Stale aggregate versions are rejected                                        | TC-SALE-005, TC-PAYMENT-006 | application |
| 10  | Debt adjustment without a reason is rejected                                 | TC-ACCOUNT-003              | domain      |

### What was actually written test-first

Being precise, because "we did TDD" is the kind of claim that quietly stops being
true:

- **Domain tests (58) were written first.** Every one was run against a missing
  module, observed failing with an unresolved import, and only then implemented.
  That covers required tests 1, 6, 8 and 10, plus every P0 rule in the kernel.
- **Application, contract and database tests (80) were written after their
  handlers**, because those handlers share one pipeline that already existed by
  then. They were not run-to-fail first.

Two of them found real defects on their first run, which is the useful part:

1. A blank adjustment reason returned the generic `INVALID_COMMAND_PAYLOAD`
   instead of `DEBT_ADJUSTMENT_REASON_REQUIRED` — the Zod schema was enforcing a
   business rule and shadowing its stable code. Command schemas were narrowed to
   validate _shape_ only; policy belongs to the domain (ADR-0003).
2. A test reused a `commandId` under a second idempotency key and was correctly
   refused with `DUPLICATE_COMMAND`.

For future work the order in
[../10-ai-coding/CHANGE_PROTOCOL.md](../10-ai-coding/CHANGE_PROTOCOL.md) applies
at every layer: failing test, observed failing for the expected reason, then code.

## Coverage policy

Global branch and function percentages are reported but deliberately do not gate
the repository. A percentage rewards testing trivial getters and says nothing
about whether BR-PAYMENT-003 holds.

The changed-code gate is stricter and local: `pnpm coverage:changed` runs the
coverage report, prints global branch/function metrics, then requires every
changed executable production line to have a covered statement. `COVERAGE_BASE`
selects the pull-request base; local runs fall back to `HEAD^`. P0 traceability
is still independently enforced by `scripts/trace-check.ts`. See
[risk-classification.md](risk-classification.md).

## Regression tests

Every fixed P0 or P1 bug gets a test that fails against the old code, named with a
new `TC-*` id and linked to the rule it protects. Weakening or deleting a test to
make a suite pass is forbidden — see
[../10-ai-coding/CHANGE_PROTOCOL.md](../10-ai-coding/CHANGE_PROTOCOL.md).

## Deliberately bounded or separate from the default suite

- **Unbounded property generation.** Invariant tests use deterministic bounded
  model sequences so CI time and failures stay predictable.
- **Desktop Playwright duplication.** Mobile runs the complete browser matrix;
  desktop runs the golden money/goods/delivery/shell specs from
  `apps/web/e2e/harness/projects.ts`. Read-only and admin scenarios do not run a
  second time unless they are explicitly promoted to that list.
- **Fixed browser waits.** `waitForTimeout` is forbidden in `apps/web/e2e/`;
  tests wait for a URL, role, text, network-visible result or persisted state.
- **Oversized test files.** `scripts/test-architecture.ts` reports warnings and
  fails hard limits by layer. It also reports files containing `toHaveClass`
  assertions as `style-contract`; behavioral browser tests remain distinguishable
  from class/configuration checks.
- **Production-shape load evidence.** `pnpm perf:production-scale` is an explicit PostgreSQL
  rehearsal rather than part of every unit run: it creates 10k customers/products,
  100k Sales/Purchases and one million ledger/movement rows, checks p95 budgets
  and fails on unexplained sequential scans. CI/release runs it with a disposable
  PostgreSQL database.

## Related

- [traceability.md](traceability.md), [manual-test-template.md](manual-test-template.md)
