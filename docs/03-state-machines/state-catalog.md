# State catalog

Every persisted lifecycle value in the system, and every derived state that looks
like one but is not stored. Adding a value to any of these enums requires updating
this file and the corresponding [transition catalog](transition-catalog.md) entry —
see [../10-ai-coding/CHANGE_PROTOCOL.md](../10-ai-coding/CHANGE_PROTOCOL.md).

## Sale status — `SaleStatus` (stored)

Defined in `packages/domain-contracts/src/sale/index.ts`.

| Value    | Meaning                                     | Terminal | Financial effect on entry  | Reachable from |
| -------- | ------------------------------------------- | -------- | -------------------------- | -------------- |
| `draft`  | Being entered. May be empty, may be edited. | no       | none (BR-SALE-010)         | creation       |
| `posted` | Completed sale. The customer owes the total | **yes**  | one account entry `+total` | `draft`        |

Two values, and the second is terminal. That is the whole stored lifecycle.

`posted` is terminal because a posted sale is immutable (BR-SALE-008). Everything
that can happen to it afterwards — voiding, replacement — is recorded **beside**
it, never in it.

## Sale financial state — `SaleFinancialState` (derived)

Computed at read time from the presence of a `sale_voids` row. Not a column.

| Value    | Derivation                                  | Meaning                                   |
| -------- | ------------------------------------------- | ----------------------------------------- |
| `active` | `status = posted` and no void record exists | The receivable stands                     |
| `voided` | `status = posted` and a void record exists  | Fully compensated; the net effect is zero |

Why derived rather than stored: a stored `voided` flag would be a second place the
truth lives, and keeping it in step would mean updating a row the system has
promised never to update. Deriving it makes "a voided sale nets to zero" true by
construction — the void record and the compensating entry are written in the same
transaction, so a sale cannot be marked voided without the money having moved.

A `draft` sale has no financial state. It has no financial effect to have a state
about.

## Sale due state — `SaleDueState` (derived)

Computed at read time from `sale.dueAt` and the reading clock (BR-SALE-017).

| Value         | Derivation      | Meaning                       |
| ------------- | --------------- | ----------------------------- |
| `no_due_date` | `dueAt IS NULL` | No term was agreed            |
| `due`         | `dueAt >= now`  | A term was agreed, not yet up |
| `overdue`     | `dueAt < now`   | The agreed date has passed    |

`no_due_date` is deliberately **not** a synonym for `overdue`. Most depot sales
carry no term at all, and calling them overdue would put every customer on a chase
list the day they buy. See ASM-016, which this bounds without closing.

## Payment status — `PaymentStatus` (stored)

Defined in `packages/domain-contracts/src/payment/index.ts`.

| Value                | Meaning                           | Terminal | Derivation                    | Reachable from                   |
| -------------------- | --------------------------------- | -------- | ----------------------------- | -------------------------------- |
| `recorded`           | Money received, nothing reversed. | no       | `reversedAmount = 0`          | creation                         |
| `partially_reversed` | Some of it undone.                | no       | `0 < reversedAmount < amount` | `recorded`, itself               |
| `reversed`           | Fully undone.                     | **yes**  | `reversedAmount = amount`     | `recorded`, `partially_reversed` |

Stored, but never assigned directly: recomputed from `reversedAmount` on every
write (BR-PAYMENT-008), so the column cannot contradict the amounts.

## Balance classification — `BalanceClassification` (derived)

Computed at read time from the sign of the customer account balance
(BR-ACCOUNT-009).

| Value             | Derivation    | Meaning                        |
| ----------------- | ------------- | ------------------------------ |
| `receivable`      | `balance > 0` | The customer owes the depot    |
| `settled`         | `balance = 0` | Nothing outstanding either way |
| `customer_credit` | `balance < 0` | The depot owes the customer    |

## Purchase status — `PurchaseStatus` (stored)

| Value       | Meaning                                  | Terminal | Supplier effect    |
| ----------- | ---------------------------------------- | -------- | ------------------ |
| `draft`     | Editable commercial document             | no       | none               |
| `confirmed` | Immutable Purchase snapshot              | yes      | one `+total` entry |
| `discarded` | Abandoned draft retained without effects | yes      | none               |

Voiding is a derived financial state from a separate `purchase_voids` row, not a
status mutation. Receipt progress is also derived and does not enter this enum.

## Supplier balance and inventory classifications (derived)

Supplier balance is `payable` above zero, `settled` at zero and
`supplier_credit` below zero. Inventory per Product/unit is `positive`, `zero` or
`negative`. Negative values are retained facts, not invalid states.

## Delivery status — `DeliveryStatus` (stored)

| Value        | Meaning                               | Terminal | Inventory effect      |
| ------------ | ------------------------------------- | -------- | --------------------- |
| `draft`      | Editable physical fulfilment proposal | no       | none                  |
| `cancelled`  | Abandoned before dispatch             | yes      | none                  |
| `dispatched` | Goods left inventory                  | no       | one negative per line |
| `delivered`  | Completion was acknowledged           | yes      | none beyond dispatch  |

Returns are immutable adjacent records with positive compensating movements;
they do not rewrite Delivery status or Sale financial history.

## Values that are NOT states

Recorded here so nobody adds them later thinking they were forgotten.

| Tempting "status"           | Where it actually lives                    | Why not a status                                                                                   |
| --------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `paid` / `unpaid` sale      | The customer account balance               | Payments are not allocated to sales (ASM-004); a sale has no payment state                         |
| `voided` sale               | Derived from `sale_voids`                  | Storing it would mean updating a row promised to be immutable (BR-SALE-008)                        |
| `overdue` customer          | Derived per sale from `dueAt` at read time | Time-dependent conditions must not be frozen into a column a cron job has to keep true             |
| `has_debt` customer         | `SUM(account entries) ≠ 0`                 | Derived; storing it creates a second source of truth for the one number that must be unambiguous   |
| `cancelled` sale            | Nowhere — the concept was removed          | A posted sale is voided, a draft is discarded. "Cancelled" collapsed two different events into one |
| `delivered` sale            | The separate Delivery aggregate            | Physical fulfilment is a separate lifecycle and never a Sale status                                |
| `returned` sale             | Immutable Delivery return records          | Returns compensate inventory; they do not become a Sale status or silently change customer debt    |
| `synced` / `pending_upload` | Client-side only                           | The server has no concept of a half-arrived command; a command either committed or did not         |

## Aggregate version

`sales.version`, `payments.version`, and `customers.version` are integers starting
at 1, incremented by exactly one on every successful state-changing command. They
are the optimistic-concurrency token (BR-SALE-006, BR-PAYMENT-007), not a state.

A posted sale's version never moves again, because nothing updates the row.
`VoidSale` therefore takes no `expectedVersion`: there is no lost update to lose,
and demanding a version the caller cannot affect would be theatre. Concurrency for
voiding is handled by a row lock plus `UNIQUE (sale_id)` on `sale_voids`
(BR-SALE-013).

## Related

- [sale-state-machine.md](sale-state-machine.md)
- [payment-state-machine.md](payment-state-machine.md)
- [transition-catalog.md](transition-catalog.md)
