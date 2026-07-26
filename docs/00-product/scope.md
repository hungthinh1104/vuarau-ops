# Scope — shadow pilot phase

## In scope

| Area                  | Delivered                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Repository foundation | pnpm workspace, strict TypeScript, five Vitest projects, lint, format, boundary/docs/trace checks       |
| Domain contracts      | Branded ids, money, quantity, commands, DTOs, events, rejection codes, capabilities, pagination         |
| Domain kernel         | Pure decision functions for customer, sale, payment, customer account, membership                       |
| Application layer     | Twelve command handlers and eleven queries: idempotency, optimistic concurrency, audit, one transaction |
| Database              | Drizzle schema, seven migrations, repositories, transaction runner, append-only and immutability guards |
| API                   | tRPC router with contract tests; every read authorized like a command                                   |
| Frontend foundation   | Next App Router, design system from `design.md`, typed tRPC client, Storybook over the state catalog    |
| Production workflows  | Payment capture and quick sale, against the real backend                                                |
| Access                | Supabase sign-in, server-derived workspace discovery, pilot onboarding CLI                              |
| Documentation         | This tree, with stable IDs and a machine-checked trace map                                              |
| Tests                 | Five Vitest projects, Next and Storybook builds, and Playwright against a real API and PostgreSQL       |

### The vertical slice

```
Authentication → Customer → Sale draft → Posted sale → Customer account entry
              → Payment → Payment reversal → Sale void → Audit history
```

Twelve commands, listed in
[command-contracts.md](../06-api-contracts/command-contracts.md). Seven of them
move money or could be mistaken for a command that does; five are lifecycle
commands with no account effect at all.

There is no `updateEntity`, no `patch`, and no procedure that takes a status as an
argument ([ADR-0002](../09-decisions/ADR-0002-command-based-writes.md)).

## Out of scope — deliberately not built

Building any of these now would commit the product to a shape it has not earned.

| Excluded                                                         | Why now is too early                                                                                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Screens beyond payment capture and quick sale                    | Two workflows are enough to answer H1 and H2; a third built before those are observed is a third guess                                                               |
| Product master search, last-price recall, pricing intelligence   | The sale line takes a typed product name by design (BR-SALE-011). Recall needs history nobody has yet                                                                |
| Dashboards, reporting                                            | No accumulated ledger data to report on, and design.md says workflows come first                                                                                     |
| AI / LLM parsing of free-text entry                              | The deterministic write path must be trustworthy before anything writes to it automatically                                                                          |
| Demand forecasting, supplier scoring, customer health scoring    | Require months of ledger history                                                                                                                                     |
| Advanced pricing recommendations                                 | Requires a pricing model that does not exist                                                                                                                         |
| Delivery route optimisation                                      | No delivery module                                                                                                                                                   |
| Generalised rule builders                                        | A rule engine before six hard-coded rules is speculation                                                                                                             |
| Inventory, receiving, allocation, delivery, invoicing, suppliers | Each is its own aggregate and lifecycle; the slice does not need them                                                                                                |
| Offline synchronisation                                          | Idempotent commands + client-supplied ids are the foundation it will need; the sync engine itself is later                                                           |
| Microservices, Kafka, Kubernetes                                 | See [ADR-0001](../09-decisions/ADR-0001-modular-monolith.md)                                                                                                         |
| Full event sourcing                                              | The customer account ledger is append-only; the rest of the system is not, and does not need to be ([ADR-0004](../09-decisions/ADR-0004-append-only-debt-ledger.md)) |
| Full double-entry accounting                                     | The depot needs customer debt, not a general ledger and trial balance                                                                                                |
| Deployment pipelines and hosting choices                         | CI is a quality gate; hosting is not chosen here and no vendor is named                                                                                              |
| Void or replacement **screen**                                   | The command exists and is tested; correcting a posted sale is an operator's job at a shell this phase, which is why the pilot is a shadow one                        |
| Role-management and customer-import screens                      | Both are once-per-depot jobs done by a facilitator with shell access                                                                                                 |

## Extension points left open, not built

These exist as shapes in the code so the excluded work can be added without a
rewrite. Nothing behind them is implemented.

- `workspaceId` on every business row and in every command → multi-workspace SaaS.
- Client-supplied aggregate ids + `idempotencyKey` → offline capture and replay.
- `transactionTime` distinct from `recordedAt` → back-dated entry and debt aging.
- `LedgerSourceType` enum → new debt sources (invoices, delivery notes) are additive.
- `Capability` on DTOs → UI affordances without a second copy of the rules.
- `Money.currency` with a per-currency exponent → non-VND currency later.
- Sale lifecycle deliberately excludes payment/delivery state → those become
  separate dimensions, not new values in this enum.

## Related

- [product-brief.md](product-brief.md)
- [../09-decisions/decision-backlog.md](../09-decisions/decision-backlog.md)
