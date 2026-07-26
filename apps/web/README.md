# apps/web — frontend foundation

The design system, the typed API client, and Storybook. **No production workflow
yet**: there is no customer search, no sale entry, no payment capture, and no sale
void screen. What exists is the ground those screens will stand on.

```bash
pnpm --filter @vuarau/web dev              # Next dev server on :3000
pnpm --filter @vuarau/web storybook        # Storybook on :6006
pnpm --filter @vuarau/web build            # production build
pnpm test:web                              # component tests (jsdom)
pnpm --filter @vuarau/web e2e              # Playwright, needs a dev server
```

## What is here

| Directory      | Responsibility                                                    |
| -------------- | ----------------------------------------------------------------- |
| `src/app`      | Next App Router: the shell, and one demonstration route           |
| `src/api`      | Talking to the backend: tRPC client, session, command identity    |
| `src/ui`       | The design system — primitives, product patterns, format and copy |
| `src/fixtures` | Typed sample data, parsed through the published schemas           |
| `src/testing`  | Vitest setup and the axe helper                                   |
| `e2e`          | Playwright skeleton                                               |

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
in the kernel (TC-WEB-005).

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

- **The workflows.** Customer, sale, payment and void screens are the next
  milestone. The demonstration route proves composition and reflow; it does not
  pretend to be a finished screen, and says so at the top.
- **An offline queue.** Client-supplied ids and idempotency keys are already in
  every command, which is the part that had to be decided at the backend
  ([ADR-0008](../../docs/09-decisions/ADR-0008-idempotency-records.md)). The sync
  engine is future work.
- **A real end-to-end suite.** `e2e/` has the configuration and two smoke specs.
  Writing more now would mean asserting against fixtures through a browser — a
  slower version of the component tests that proves less.
- **A dashboard.** design.md: don't build one before the core workflows.
