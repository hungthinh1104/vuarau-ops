# State catalog

Every persisted lifecycle value in the system. Adding a value to any of these
enums requires updating this file and the corresponding
[transition catalog](transition-catalog.md) entry — see
[../10-ai-coding/CHANGE_PROTOCOL.md](../10-ai-coding/CHANGE_PROTOCOL.md).

## Order status — `OrderStatus`

Defined in `packages/domain-contracts/src/order/index.ts`.

| Value       | Meaning                                      | Terminal | Financial effect on entry                          | Reachable from       |
| ----------- | -------------------------------------------- | -------- | -------------------------------------------------- | -------------------- |
| `draft`     | Being entered. May be empty, may be edited.  | no       | none                                               | creation             |
| `confirmed` | Committed sale. The customer owes the total. | no       | one ledger entry `+total`                          | `draft`              |
| `cancelled` | Called off. **Not implemented** (ASM-005).   | yes      | if from `confirmed`, a compensating `−total` entry | `draft`, `confirmed` |

## Payment status — `PaymentStatus`

Defined in `packages/domain-contracts/src/payment/index.ts`.

| Value                | Meaning                           | Terminal | Derivation                    | Reachable from                   |
| -------------------- | --------------------------------- | -------- | ----------------------------- | -------------------------------- |
| `recorded`           | Money received, nothing reversed. | no       | `reversedAmount = 0`          | creation                         |
| `partially_reversed` | Some of it undone.                | no       | `0 < reversedAmount < amount` | `recorded`, itself               |
| `reversed`           | Fully undone.                     | **yes**  | `reversedAmount = amount`     | `recorded`, `partially_reversed` |

## Values that are NOT states

Recorded here so nobody adds them later thinking they were forgotten.

| Tempting "status"           | Where it actually lives                             | Why not a status                                                                                 |
| --------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `paid` / `unpaid` order     | Customer ledger balance                             | Payments are not allocated to orders (ASM-004); an order has no payment state                    |
| `overdue` customer          | Computed from ledger `transactionTime` at read time | Time-dependent conditions must not be frozen into a column that a cron job has to keep true      |
| `has_debt` customer         | `SUM(ledger.amount) ≠ 0`                            | Derived; storing it creates a second source of truth for the one number that must be unambiguous |
| `delivered` order           | A future Delivery aggregate                         | A separate lifecycle dimension                                                                   |
| `synced` / `pending_upload` | Client-side only                                    | The server has no concept of a half-arrived command; a command either committed or did not       |

## Aggregate version

`orders.version`, `payments.version`, and `customers.version` are integers starting
at 1, incremented by exactly one on every successful state-changing command. They
are the optimistic-concurrency token (BR-ORDER-006, BR-PAYMENT-007), not a state.

## Related

- [order-state-machine.md](order-state-machine.md)
- [payment-state-machine.md](payment-state-machine.md)
