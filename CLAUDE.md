# vuarau-ops — working agreement

An **operational decision system for wholesale vegetable depots (vựa rau) in
Vietnam**. Not an ERP, not accounting, not inventory software.

Its job: capture transactions fast, keep debt and payment records trustworthy,
recover from mistakes safely.

Read [docs/00-product/product-brief.md](docs/00-product/product-brief.md) before
designing anything. Read
[docs/09-decisions/decision-backlog.md](docs/09-decisions/decision-backlog.md)
before assuming a business policy.

## Hard rules

```
- Never update or delete a finalized financial record. Append a compensating one.
- Never store a debt balance as the truth. The ledger is the truth; the summary is a cache.
- Never trust `actorId` from a request. It is checked against a verified token, never its source.
- Every command declares one permission. Every procedure requires a verified identity — reads included.
- Never change a lifecycle status through a generic patch. Use a named command.
- The backend owns business rules. The frontend consumes contracts and capabilities.
- Money is integer minor units. Quantities are integer milli-units. No floats, ever.
- transactionTime is when it happened; recordedAt is when we recorded it. Never one field.
- Every ledger entry names an actor and a command. No anonymous money movement.
- Every business-rule change needs rule documentation, a trace-map entry, and a test.
- Every state change needs a state-catalog and transition-catalog review.
- Every P0 bug fix needs a regression test.
- Never weaken, skip, or delete a test to make the suite pass.
- No new dependency without a stated reason and no simpler alternative.
- Do not implement anything on the excluded list in docs/00-product/scope.md.
```

## Repository map

```
apps/api                  the only backend. modules/ = business, infrastructure/ = adapters, operations/ = shell tools
apps/web                  the production web app. Next App Router, design system, Storybook
packages/domain-contracts  ids, money, commands, DTOs, rejection codes  (zod only)
packages/domain-kernel     pure decisions — no framework, no clock, no I/O
packages/db                drizzle schema, migrations, repositories, seeds
packages/test-fixtures     deterministic fixtures for every test project
scripts/                   boundary-check, trace-check, docs-check
docs/                      the specification (see below)
```

Dependency direction, enforced by `pnpm boundary:check`:

```
apps/api → domain-kernel → domain-contracts
   └────→ db ────────────────────↗
```

`domain-kernel` may not import tRPC, Drizzle, Supabase, React, HTTP, `node:*`, or
even Zod. Decision functions are deterministic: ids arrive in the payload,
`recordedAt` arrives as an argument.

## Commands

```bash
pnpm install
pnpm verify            # every gate below, in order

pnpm test:domain       # pure decisions — fastest useful signal
pnpm test:application  # command handlers over in-memory ports
pnpm test:contract     # tRPC round-trips
pnpm test:db           # real Postgres
pnpm test:web          # components and stories, in jsdom
pnpm web:build         # Next production build
pnpm web:storybook     # Storybook build
pnpm web:e2e           # Playwright: real browser, real API process, real Postgres

pnpm boundary:check pnpm trace:check pnpm docs:check
pnpm db:generate pnpm db:migrate pnpm db:seed

# Operator tools. Shell access is the authorization boundary; none is a procedure.
pnpm --filter @vuarau/api ops:pilot help
pnpm --filter @vuarau/api ops:rebuild-balance <workspaceId> <customerId>
```

`test:db` and `web:e2e` **skip** without `DATABASE_URL` so a laptop with no
Postgres still gets a green `pnpm verify` — and **fail rather than skip when `CI`
is set**. On a laptop a skip is a convenience; in CI it is a green build that
asserted nothing about the database, discovered later by an incident whose test
"passed" every day.

Postgres for `test:db`:

```bash
docker run -d --name vuarau-ops-dev-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=vuarau_test \
  -p 55432:5432 postgres:17-alpine
export DATABASE_URL=postgres://postgres:postgres@localhost:55432/vuarau_test
```

## The twelve commands

```
customer   CreateCustomer · UpdateCustomer · DeactivateCustomer
sale       CreateSaleDraft · UpdateSaleDraft · DiscardSaleDraft · PostSale · VoidSale
payment    RecordCustomerPayment · ReverseCustomerPayment
account    AdjustCustomerDebt
platform   RevokeWorkspaceMembership
```

Seven of them move money or could be mistaken for one that does; five are
lifecycle commands with no account effect at all.

The read surface is eleven procedures: `session.me` · `session.workspaces` ·
`customer.search` · `customer.get` · `sale.get` · `sale.list` · `payment.get` ·
`payment.list` · `account.balance` · `account.timeline` · `audit.timeline`.

There is no `updateEntity`, `updateSaleStatus`, `patchCustomerDebt`,
`setPaymentStatus`, or `CancelSale`, and none is to be added. Every command
carries `commandId`, `idempotencyKey`, `workspaceId`, `actorId`, `occurredAt`, and
`expectedVersion` when it changes an existing aggregate.

Each also declares one required permission. `AdjustCustomerDebt` needs
`debt.adjust` and `VoidSale` needs `sale.void`, both held by `owner` and
`accountant` only. The role table is one literal in
`packages/domain-contracts/src/shared/authorization.ts` — a table, not a policy
engine ([ADR-0011](docs/09-decisions/ADR-0011-role-permission-mapping.md)).

## Current phase — shadow pilot

The product is complete enough to put in front of one depot worker and watch.
Both browser workflows — **record a payment** and **quick sale** — run end to end
against a real server and a real database. Sign-in is Supabase (email plus a
six-digit code), and the depot list comes from `session.workspaces`, never from a
build-time variable (BR-AUTH-008). A facilitator prepares the depot with
`ops:pilot`: create the workspace, provision a member, import the worker's own
customers from a CSV.

The pilot mode is **shadow usability** and is written down before the first
session ([pilot-mode.md](docs/00-product/pilot-mode.md)): an isolated workspace,
real names and real numbers, and the depot's notebook remains its book. It is not
an operational pilot, and the four things that would make it one — void and
replacement UI, a rehearsed restore, real role assignment, an incident runbook —
are listed there rather than assumed.

Excluded in this phase, on top of [scope.md](docs/00-product/scope.md): a void or
replacement **screen**, a role-management screen, a customer-import screen, an
offline queue, an analytics service, and any dashboard.

**No claim about H2 has been earned.** Nothing in this repository can measure
whether a worker records a sale accurately and unaided inside the target time; a
green suite is evidence for integration safety and nothing else
([validation-plan.md](docs/00-product/validation-plan.md)).

## Sale, not order

A **sale** is a completed transaction: goods handed over, price agreed. Not a
request, not a delivery ([ADR-0013](docs/09-decisions/ADR-0013-sale-not-order.md)).

```
stored lifecycle    draft → posted            posted is terminal and immutable
derived state       active | voided           from the presence of a sale_voids row
correction          VoidSale + optional replacement sale, never an edit
```

`AdjustCustomerDebt` is **not** how a wrong sale is corrected. It is for movements
with no underlying document — opening balance, write-off, dispute settlement,
migration correction (BR-ACCOUNT-010,
[ADR-0012](docs/09-decisions/ADR-0012-sale-void-and-replacement.md)).

The debt ledger is the **customer account ledger**; the debt summary is the
**customer account balance**; a negative balance is **customer credit**, never a
negative debt.

## Documentation rules

Docs are the specification, not a description written afterwards
([ADR-0005](docs/09-decisions/ADR-0005-markdown-docs-as-source-of-truth.md)).

- A business rule gets an ID, a risk class, and a rejection code before it gets code.
- IDs (`UC-*`, `BR-*`, `CASE-*`, `TC-*`, `ADR-*`, `ASM-*`) are **never reused**.
  Retired artefacts are marked deprecated, not deleted.
- Test names carry their IDs: `describe("BR-PAYMENT-003 / TC-PAYMENT-007", …)`.
- Update [docs/08-qa/trace-map.yml](docs/08-qa/trace-map.yml) in the same change.

## Definition of done

- [ ] `pnpm verify` passes.
- [ ] New/changed rules documented with an ID and risk class.
- [ ] Every P0 rule touched has an automated test.
- [ ] Failing test written first, observed failing for the expected reason.
- [ ] Trace map updated; no boundary crossed; no unrelated files changed.
- [ ] New assumptions recorded as `ASM-*` in the decision backlog.

## Where to look

| Question                                             | Document                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| What is this product?                                | [docs/00-product/product-brief.md](docs/00-product/product-brief.md)                                               |
| What is deliberately excluded?                       | [docs/00-product/scope.md](docs/00-product/scope.md)                                                               |
| What does "công nợ" mean in code?                    | [docs/01-domain/glossary.md](docs/01-domain/glossary.md)                                                           |
| Which use cases exist, and which are only specified? | [docs/02-use-cases/use-case-catalog.md](docs/02-use-cases/use-case-catalog.md)                                     |
| What are the rules?                                  | [docs/04-business-rules/](docs/04-business-rules/sale-rules.md)                                                    |
| Which error code do I return?                        | [docs/04-business-rules/error-code-catalog.md](docs/04-business-rules/error-code-catalog.md)                       |
| Why is the ledger append-only?                       | [docs/09-decisions/ADR-0004-append-only-debt-ledger.md](docs/09-decisions/ADR-0004-append-only-debt-ledger.md)     |
| How is a wrong sale corrected?                       | [docs/09-decisions/ADR-0012-sale-void-and-replacement.md](docs/09-decisions/ADR-0012-sale-void-and-replacement.md) |
| Which timestamp do I use?                            | [docs/07-data/time-semantics.md](docs/07-data/time-semantics.md)                                                   |
| What must the UI be able to render?                  | [docs/06-api-contracts/ui-state-catalog.md](docs/06-api-contracts/ui-state-catalog.md)                             |
| How do I make a change?                              | [docs/10-ai-coding/CHANGE_PROTOCOL.md](docs/10-ai-coding/CHANGE_PROTOCOL.md)                                       |
| What must a review catch?                            | [docs/10-ai-coding/REVIEW_CHECKLIST.md](docs/10-ai-coding/REVIEW_CHECKLIST.md)                                     |
| What is still undecided?                             | [docs/09-decisions/decision-backlog.md](docs/09-decisions/decision-backlog.md)                                     |
| What kind of pilot is this?                          | [docs/00-product/pilot-mode.md](docs/00-product/pilot-mode.md)                                                     |
| How do I set a depot up for one?                     | [docs/00-product/pilot-onboarding.md](docs/00-product/pilot-onboarding.md)                                         |

## If you are about to guess a business policy — don't

Check the [decision backlog](docs/09-decisions/decision-backlog.md). If the answer
is not there, add an `ASM-*` row, implement the smallest reversible default, and
say so in your summary. Silently deciding whether debt can go negative, or when
debt arises, bakes a guess into data that cannot be un-baked.
