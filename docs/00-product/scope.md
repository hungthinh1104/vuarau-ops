# Scope — bootstrap phase

## In scope

| Area                  | Delivered                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Repository foundation | pnpm workspace, strict TypeScript, Vitest projects, lint, format                                  |
| Domain contracts      | Branded ids, money, quantity, commands, DTOs, events, rejection codes, capabilities               |
| Domain kernel         | Pure decision functions for customer, sale, payment, customer account                             |
| Application layer     | Six command handlers with idempotency, optimistic concurrency, audit, one transaction per command |
| Database              | Drizzle schema + migration for the slice, repositories, transaction runner, append-only guards    |
| API                   | tRPC router with contract tests                                                                   |
| Documentation         | This tree, with stable IDs and a machine-checked trace map                                        |
| Tests                 | Domain, application, contract, and database projects                                              |

### The one vertical slice

```
Customer → Sale draft → Posted sale → Customer account entry
        → Customer payment → Payment reversal
        → Customer customer account balance → Audit history
```

Six commands, no more:
`CreateCustomer`, `CreateSaleDraft`, `PostSale`, `RecordCustomerPayment`,
`ReverseCustomerPayment`, `AdjustCustomerDebt`.

## Out of scope — deliberately not built

Building any of these now would commit the product to a shape it has not earned.

| Excluded                                                         | Why now is too early                                                                                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production web UI                                                | Backend contracts must settle first; `apps/web` is a placeholder                                                                                                     |
| Mobile UI                                                        | Same                                                                                                                                                                 |
| Dashboards, reporting                                            | No accumulated ledger data to report on                                                                                                                              |
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
| Deployment pipelines                                             | CI runs quality gates only                                                                                                                                           |

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
