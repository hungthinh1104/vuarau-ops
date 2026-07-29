# Current scope — trusted sales ledger

This document records the currently delivered boundary. The product direction
and the only authorized near-term sequence are in [roadmap.md](roadmap.md):
M8–M18 now have technical implementation evidence, including versioned logical
restore and inbound Goods Truth. M19 delivery/outbound fulfilment and later
modules are not approved by this batch.

## In scope

| Area                  | Delivered                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Repository foundation | pnpm workspace, strict TypeScript, five Vitest projects, lint, format, boundary/docs/trace checks       |
| Domain contracts      | Branded ids, money, quantity, commands, DTOs, events, rejection codes, capabilities, pagination         |
| Domain kernel         | Pure decisions for customer money, Supplier payable, Purchase, Receiving and inventory movement         |
| Application layer     | Twelve command handlers and eleven queries: idempotency, optimistic concurrency, audit, one transaction |
| Database              | Drizzle schema, migrations, repositories, transaction runner, append-only and immutability guards       |
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

| Excluded                                                      | Why now is too early                                                                                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pricing intelligence                                          | Product catalog exists, but a typed sale-line snapshot remains truth and no pricing engine is justified                                                              |
| Customer-local history recall                                 | Delivered as explicit historical recall; it never auto-applies a price                                                                                               |
| Dashboards, reporting                                         | No accumulated ledger data to report on, and design.md says workflows come first                                                                                     |
| AI / LLM parsing of free-text entry                           | The deterministic write path must be trustworthy before anything writes to it automatically                                                                          |
| Demand forecasting, supplier scoring, customer health scoring | Require months of ledger history                                                                                                                                     |
| Advanced pricing recommendations                              | Requires a pricing model that does not exist                                                                                                                         |
| Delivery route optimisation                                   | No delivery module                                                                                                                                                   |
| Generalised rule builders                                     | A rule engine before six hard-coded rules is speculation                                                                                                             |
| Delivery, allocation, invoicing and inventory valuation       | M18 records inbound physical quantity; outbound fulfilment is M19 and valuation remains excluded                                                                     |
| Offline mutation queues beyond Quick Sale                     | M13 is deliberately limited to its customer/sale chain; payment, correction and catalog mutations stay online                                                        |
| Microservices, Kafka, Kubernetes                              | See [ADR-0001](../09-decisions/ADR-0001-modular-monolith.md)                                                                                                         |
| Full event sourcing                                           | The customer account ledger is append-only; the rest of the system is not, and does not need to be ([ADR-0004](../09-decisions/ADR-0004-append-only-debt-ledger.md)) |
| Full double-entry accounting                                  | The depot needs customer debt, not a general ledger and trial balance                                                                                                |
| Deployment pipelines and hosting choices                      | CI is a quality gate; hosting is not chosen here and no vendor is named                                                                                              |
| Sale correction **screen**                                    | M8 closes this existing command workflow; it must reuse the immutable-sale/void/replacement model rather than inventing a correction engine                          |
| Role-management and customer-import screens                   | M11/M12 work; not authorized before Money Truth is closed                                                                                                            |

## Extension points left open, not built

These exist as shapes in the code so the excluded work can be added without a
rewrite. Nothing behind them is implemented.

- `workspaceId` on every business row and in every command → multi-workspace SaaS.
- Client-supplied aggregate ids + `idempotencyKey` → offline capture and replay.
- `transactionTime` distinct from `recordedAt` → back-dated entry and debt aging.
- Explicit customer, Supplier and inventory source enums → new proven sources are additive.
- `Capability` on DTOs → UI affordances without a second copy of the rules.
- `Money.currency` with a per-currency exponent → non-VND currency later.
- Sale lifecycle deliberately excludes payment/delivery state → those become
  separate dimensions, not new values in this enum.

## Related

- [product-brief.md](product-brief.md)
- [roadmap.md](roadmap.md)
- [../09-decisions/decision-backlog.md](../09-decisions/decision-backlog.md)
