# Context map

One deployable backend, four bounded modules inside it. Modules communicate by
command and by explicit ledger effect — never by reaching into each other's tables.

## Modules in this phase

```
┌──────────────┐        ┌──────────────┐
│   Customer   │        │    Order     │
│ (master data)│◀───────│ (draft →     │
└──────┬───────┘  ref   │  confirmed)  │
       │                └──────┬───────┘
       │                       │ ConfirmOrder emits
       │                       │ +total ledger entry
       │                       ▼
       │                ┌──────────────────────┐
       │  ref           │        Debt          │
       └───────────────▶│  append-only ledger  │◀── AdjustCustomerDebt
                        │  + summary projection│
                        └──────────▲───────────┘
                                   │ −amount / +reversal
                            ┌──────┴───────┐
                            │   Payment    │
                            │ recorded →   │
                            │ partially_   │
                            │ reversed →   │
                            │ reversed     │
                            └──────────────┘
```

## Ownership

| Module                    | Owns                                             | Never touches              |
| ------------------------- | ------------------------------------------------ | -------------------------- |
| **Customer**              | `customers`                                      | Any financial table        |
| **Order**                 | `orders`, `order_lines`                          | `payments`, summary rows   |
| **Payment**               | `payments`, `payment_reversals`                  | `orders`                   |
| **Debt**                  | `debt_ledger_entries`, `customer_debt_summaries` | Aggregate tables           |
| **Audit** (cross-cutting) | `audit_logs`                                     | Everything else, read-only |

Order and Payment do not write ledger rows themselves. Their decision functions
**describe** a ledger effect; the Debt module's writer is the only code that
appends one. That is what makes "debt changes only through ledger-producing
commands" (BR-DEBT-002) enforceable rather than aspirational.

## Layer dependency direction

```
apps/api  ──▶ packages/domain-kernel ──▶ packages/domain-contracts
    │                   ▲                          ▲
    └────────▶ packages/db ────────────────────────┘
```

- `domain-contracts` depends on nothing but Zod.
- `domain-kernel` depends only on `domain-contracts`. No Drizzle, no tRPC, no HTTP,
  no clock, no randomness.
- `packages/db` maps rows to domain state, so it imports `domain-kernel` — that
  arrow points inwards and is correct. It never imports `apps/api`: the
  application layer declares the repository ports and the Drizzle implementations
  satisfy them _structurally_, so the arrow cannot invert.
- `apps/api` never imports `drizzle-orm`; it reaches persistence only through
  ports.
- Nothing depends on `apps/api`.

Enforced mechanically by `scripts/boundary-check.ts`.

## Future contexts (not built)

Inventory, Receiving, Delivery, Invoicing, Supplier, Pricing. Each would become a
sibling module emitting its own ledger source type. `LedgerSourceType` is an enum
precisely so that adding one is additive.

## Related

- [glossary.md](glossary.md)
- [../09-decisions/ADR-0001-modular-monolith.md](../09-decisions/ADR-0001-modular-monolith.md)
- [../10-ai-coding/REPO_MAP.md](../10-ai-coding/REPO_MAP.md)
