# Test strategy

## Four projects, four failure modes

Configured in `vitest.config.ts`.

| Project       | Command                 | Scope                                                                                          | Needs          |
| ------------- | ----------------------- | ---------------------------------------------------------------------------------------------- | -------------- |
| `domain`      | `pnpm test:domain`      | Pure decision functions in `packages/domain-kernel` and schemas in `packages/domain-contracts` | nothing        |
| `application` | `pnpm test:application` | Command handlers over in-memory ports (`apps/api/**/*.app.test.ts`)                            | nothing        |
| `contract`    | `pnpm test:contract`    | tRPC caller round-trips and DTO shape (`apps/api/**/*.contract.test.ts`)                       | nothing        |
| `db`          | `pnpm test:db`          | Real Postgres: migrations, repositories, constraints, triggers (`packages/db/**/*.db.test.ts`) | `DATABASE_URL` |

The first three need no database, no clock control, and no network. That is a
direct consequence of ADR-0003: a pure kernel is a fast test suite.

## Database tests

`pnpm test:db` **skips** its suites when `DATABASE_URL` is unset rather than
failing, so a laptop without Postgres still gets a green `pnpm verify`. Skipped is
reported as skipped — the summary says so.

To run them locally:

```bash
docker run -d --name vuarau-ops-dev-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=vuarau_test \
  -p 55432:5432 postgres:17-alpine

export DATABASE_URL=postgres://postgres:postgres@localhost:55432/vuarau_test
pnpm db:migrate
pnpm test:db
```

CI runs a `postgres:17` service container, so the suites execute there on every
push.

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

**Test names carry IDs.**

```ts
describe("BR-PAYMENT-003 / TC-PAYMENT-007", () => { … });
```

This is what makes [traceability](traceability.md) mechanical.

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

No global coverage percentage is enforced. A percentage rewards testing trivial
getters and says nothing about whether BR-PAYMENT-003 holds.

What is enforced instead: **every P0 rule has at least one automated test**,
checked by `scripts/trace-check.ts`. See
[risk-classification.md](risk-classification.md).

## Regression tests

Every fixed P0 or P1 bug gets a test that fails against the old code, named with a
new `TC-*` id and linked to the rule it protects. Weakening or deleting a test to
make a suite pass is forbidden — see
[../10-ai-coding/CHANGE_PROTOCOL.md](../10-ai-coding/CHANGE_PROTOCOL.md).

## Not yet in place

- **Property-based tests.** The obvious candidate is "balance always equals the sum
  of entries, for any sequence of commands". Worth doing; would need `fast-check`.
  Not added in this phase — the invariant is covered by example-based tests today.
- **Playwright end-to-end.** Reserved for when a UI exists.
- **Load and concurrency-under-contention tests.** Version conflicts are tested
  deterministically, not under real parallel load.

## Related

- [traceability.md](traceability.md), [manual-test-template.md](manual-test-template.md)
