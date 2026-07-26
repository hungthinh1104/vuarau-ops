# apps/web

Two production workflows — **record a payment** and **quick sale** — on the design
system and typed tRPC client from the previous milestone.

```bash
pnpm --filter @vuarau/web dev              # Next dev server on :3000
pnpm --filter @vuarau/web storybook        # Storybook on :6006
pnpm --filter @vuarau/web build            # production build
pnpm test:web                              # component tests (jsdom)
DATABASE_URL=… pnpm web:e2e                # end to end, against a real API + Postgres
```

## Routes

| Route                          | What it does                                           |
| ------------------------------ | ------------------------------------------------------ |
| `/customers`                   | Search by name or phone, with each customer's balance  |
| `/customers/[id]`              | Balance, account timeline, and the two actions         |
| `/customers/[id]/payments/new` | Record a payment, with the resulting balance previewed |
| `/payments/[id]`               | What was recorded, read back from the server           |
| `/customers/[id]/sales/new`    | Quick sale: multi-line entry, save draft, post         |
| `/sales/[id]`                  | The posted sale and the account entry it produced      |
| `/demo`                        | **Fixtures.** Design review only, and labelled as such |

Everything except `/` and `/demo` sits behind `SessionGate`: a Supabase session,
a depot discovered from `session.workspaces` and chosen by a person, and a
`session.me` that still answers.

## Signing in

An email and a six-digit code, through the official Supabase browser client. No
password: a depot phone is shared, a password on a shared phone gets written on
the wall next to it, and the recovery flow for a forgotten one is a support
conversation nobody is staffed for. A code rather than a magic link, because a
link means leaving the app for an email client and coming back through a browser
that may not hold the session.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=…            # publishable; authorises nothing alone
```

Both are public by design. The JWT **signing** material verifies tokens and lives
in the API process — never in a `NEXT_PUBLIC_*` variable, which is a bundle a
phone downloads.

Sign-up is off (`shouldCreateUser: false`). A pilot participant is provisioned by
the facilitator beforehand; left on, a typo would create an account that can sign
in and see nothing at all, which is the most confusing possible outcome.

Without both variables the app shows "chưa cấu hình đăng nhập" and names them,
rather than a client that throws on first use.

### The depot list

`session.workspaces`, from the server (BR-AUTH-008). It used to be
`NEXT_PUBLIC_WORKSPACES`, a build-time variable naming ids and labels — which made
the browser the author of a claim only the server can make, and meant adding a
depot to a pilot needed a rebuild. That variable is **gone**, not kept as a
fallback: a second source for "which depots exist" is a second answer to it.

Selection is still explicit, including when the server returns exactly one. That
is the case where somebody who keeps two depots would not notice which set of
books they were writing into.

### The one door for the end-to-end suite

Playwright runs against a real API and a real database but **no Supabase project**
— CI has none, and standing one up would make questions about Postgres rows depend
on a third party. So `apps/web/e2e/harness/` mints a token against the API's
configured secret and writes it to `sessionStorage`, and the app reads it only
when two locks are open:

```text
NEXT_PUBLIC_E2E_AUTH_BRIDGE=1     set by playwright.config.ts, and nowhere else
NODE_ENV !== "production"          Next resolves this at build time and removes
                                   the branch, so the bridge is not in a
                                   production bundle at all
```

TC-WEB-024 asserts an injected token is ignored with the flag unset. "Off by
default" is one line to break by accident, so it is tested rather than commented.

## What is here

| Directory      | Responsibility                                                      |
| -------------- | ------------------------------------------------------------------- |
| `src/app`      | Next App Router: `(app)` holds every production route               |
| `src/api`      | Supabase auth, tRPC client, session gate, command identity, metrics |
| `src/ui`       | The design system — primitives, product patterns, format and copy   |
| `src/fixtures` | Typed sample data for stories and tests. **Never a route**          |
| `src/testing`  | Vitest setup and the axe helper                                     |
| `e2e`          | Playwright, against a real API process and a real database          |

## The one import that crosses to the server

```ts
import type { AppRouter } from "@vuarau/api"; // apps/web/src/api/trpc.ts, and nowhere else
```

`import type` is erased before a bundler sees it, so no server code — Drizzle,
postgres.js, jose — can reach the browser through it. That is enforced rather than
remembered: `scripts/boundary-check.ts` forbids naming `@vuarau/api` anywhere under
`apps/web/src` except that one file, and forbids `@vuarau/db`, `@vuarau/domain-kernel`,
`drizzle-orm`, `postgres` and `node:` outright.

Everything else comes from `@vuarau/domain-contracts`, which is Zod and nothing
else, and is compiled by Next as workspace source (`transpilePackages`) so there is
no built copy to go stale.

## Same-origin, no CORS

The browser calls `/trpc`, which `next.config.ts` rewrites to the API. Cross-origin
would mean writing a CORS policy before there is a deployment to write it for, and
that guess would be copied into production. Set `NEXT_PUBLIC_API_ORIGIN` to point
the rewrite somewhere other than `http://localhost:3000`.

Authentication is Supabase's. `createApiClient` takes a **token getter**, not a
token, so a refresh mid-session is invisible to every call site. There is no
client-side session logic here on purpose: a second implementation of "is this
person signed in" is a second answer to it.

## The rules the components encode

These are not style preferences. Each one is a way this product has to fail, and
each has a test named after it.

**A control is enabled when the session permission is held _and_ the aggregate
capability allows it.** Sale and payment capabilities carry state only — they are
computed in the domain kernel, which by construction does not know who is asking.
A screen reading only `capabilities.void.allowed` offers a void button to a `sales`
worker. `CapabilityAction` is the one component that makes this decision
(TC-WEB-007).

**A customer credit is never a negative debt.** The wording comes from
`classification`, which the server computed; `describeBalance` never looks at the
sign. "Nợ −500.000" sends a worker to collect money from somebody the depot owes
(TC-WEB-003).

**Loading never renders `0 ₫`.** There is no path through `BalanceCard` that
formats a balance it does not have. A worker who reads a placeholder as a balance
collects nothing from somebody who owes millions (TC-WEB-004).

**A stale version asks for a reload, never a retry.** `StaleVersionNotice` has no
`onRetry` prop — resending would apply an intention formed against data this user
never saw (TC-WEB-009).

**An unknown network outcome keeps its identity.** `commandId` and
`idempotencyKey` are minted once and carried through every attempt. Regenerating
the key turns one sale into two, and no server-side rule can prevent it
(TC-WEB-010).

**Copy is keyed by rejection code, never by `error.message`.** Messages are English
today and will be reworded; the code is the contract (TC-WEB-011).

**Money and quantity are integers or refusals.** `parseMoneyText` rejects a
fractional đồng rather than rounding it — rounding is a business rule and it lives
in `domain-contracts`, in one copy, which the browser and the server both call
(TC-WEB-005, TC-WEB-021).

**A command settles once.** `useCommand` refuses a second submit after the server
has said yes. Two intentions with two idempotency keys are indistinguishable from
two real payments, so the client has to refuse — the server cannot (TC-E2E-006).

## Command identity, and the three ways a command ends

```text
the server said yes    → done; the runner is settled and will not submit again
the server said no     → a definite answer, nothing committed, every field kept
nothing came back      → the command MAY have committed; resend the same identity
```

The third is not an error and is never rendered as one. `CommandOutcome` checks it
first, because a worker who reads "thất bại" taps again, and a second tap with a
fresh key is a second sale no server-side rule can prevent.

`COMMAND_IN_PROGRESS` — the one retryable code — is handled inside `useCommand`:
it waits and resends the identical command rather than surfacing a refusal for a
command that is about to succeed.

## Workflow metrics

`src/api/workflow-metrics.ts` counts workflow shape and timing: line counts,
timestamps, error and retry counts. The event type is closed — a metric name and a
number, with no field that could hold a name, a note or an amount. TC-WEB-023
checks the vocabulary; TC-E2E-020 checks a real rendered sale emits nothing from
the sale it recorded.

Nothing is wired to an analytics service, because there is no service, no endpoint
and no consent flow. Events go to the console in development and nowhere in
production.

`ACCEPTANCE_TARGETS` in the same file records the pilot targets. **Nothing in the
test suite measures them** — a headless browser typing at machine speed says
nothing about a person on a phone at a loading bay. They are settled by
`docs/00-product/pilot-worksheet.md`.

## Storybook is the executable state catalog

Every state in
[docs/06-api-contracts/ui-state-catalog.md](../../docs/06-api-contracts/ui-state-catalog.md)
is a story, and `catalog-coverage.test.ts` (TC-WEB-012) fails the build when the
document, `src/ui/catalog-state.ts` and the stories disagree. Stories declare their
state with `parameters: coversState("balance_customer_credit")`.

No story needs a running backend. Each is a fixed DTO plus a fixed rejection, and
`fixtures.test.ts` (TC-WEB-001) parses every fixture through the schema the server
validates with — so a DTO that changes shape breaks the stories rather than
shipping a design system that renders a contract nobody serves.

## Storybook uses Vite, not Next

Every primitive and pattern is plain React: no `next/link`, no `next/navigation`,
no server components. So Storybook needs `@storybook/react-vite` rather than Next's
build, and Vite is already in the workspace as Vitest's engine. If a component ever
needs a Next primitive, that is the signal it belongs in `src/app`.

The interactive primitives carry `"use client"` so a real screen can be a server
component that renders them. The demonstration route is a client component because
it passes handlers, and a function prop does not cross the server boundary.

## What is deliberately absent

- **Void and replacement screens.** `VoidSale` exists, is tested, and has no UI, so
  correcting a posted sale is an operator's job at a shell. That is the single
  sharpest reason the pilot is a shadow one
  ([pilot-mode.md](../../docs/00-product/pilot-mode.md)).
- **A customer-create screen, and any import screen.** Customers arrive through
  the onboarding CLI before a session (BR-CUSTOMER-005); an import UI would be a
  second way to create them with its own validation and its own bugs.
- **An offline queue.** Client-supplied ids and idempotency keys are already in
  every command, which is the part that had to be decided at the backend
  ([ADR-0008](../../docs/09-decisions/ADR-0008-idempotency-records.md)). The sync
  engine is future work.
- **A dashboard.** design.md: don't build one before the core workflows.
