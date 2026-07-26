# Order state machine

**Aggregate:** `Order` · **Dimension:** commercial lifecycle only

```
        CreateOrder                ConfirmOrder
  ( ∅ ) ───────────▶ [ draft ] ────────────────▶ [ confirmed ]
                         │                            │
                         │ CancelOrder                │ CancelOrder
                         │ (not implemented)          │ (not implemented)
                         ▼                            ▼
                    [ cancelled ]  ◀──────────────────┘
                       terminal
```

## What this dimension deliberately excludes

Allocation, picking, delivery, invoicing, and payment state are **not** values in
this enum and never will be. They are independent lifecycles that would otherwise
force combinations like `confirmed_partially_delivered_partially_paid`. When those
modules arrive they get their own state, on their own aggregate.

Likewise, "is this order paid?" is **not** an order state. It is a question about
the customer's ledger balance, and answering it from the order would duplicate the
debt module's job.

## Transitions

| #           | From        | To          | Command        | Guards                                                                                              | Effects                                                                                                                    | Events            | Rejection codes                                                                          | Terminal |
| ----------- | ----------- | ----------- | -------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------- | -------- |
| T-ORDER-001 | ∅           | `draft`     | `CreateOrder`  | Customer exists in workspace; every line valid (BR-ORDER-003); currencies consistent (BR-ORDER-009) | Order row at `version = 1`; total computed (BR-ORDER-001, BR-ORDER-004)                                                    | `order.created`   | `CUSTOMER_NOT_FOUND`, `ORDER_LINE_INVALID`, `ORDER_CURRENCY_MISMATCH`                    | no       |
| T-ORDER-002 | `draft`     | `confirmed` | `ConfirmOrder` | `expectedVersion` matches (BR-ORDER-006); ≥ 1 line (BR-ORDER-002); every line valid (BR-ORDER-003)  | `version + 1`; `confirmedAt` set; **exactly one** ledger entry `+total` (BR-ORDER-007); debt summary updated; audit record | `order.confirmed` | `ORDER_EMPTY`, `ORDER_LINE_INVALID`, `ORDER_VERSION_CONFLICT`, `ORDER_ALREADY_CONFIRMED` | no       |
| T-ORDER-003 | `draft`     | `cancelled` | `CancelOrder`  | —                                                                                                   | none financially                                                                                                           | `order.cancelled` | —                                                                                        | yes      |
| T-ORDER-004 | `confirmed` | `cancelled` | `CancelOrder`  | Requires a compensating ledger entry for the full order total                                       | ledger `−total`                                                                                                            | `order.cancelled` | —                                                                                        | yes      |

**T-ORDER-003 and T-ORDER-004 are documented but not implemented** in this phase.
There is no `CancelOrder` command. The `cancel` capability on `OrderDto` therefore
always returns `{ allowed: false, reasonCode: "COMMAND_NOT_AVAILABLE" }` — the UI
learns this from the server rather than hard-coding it. Tracked as ASM-005.

## Self-transitions and idempotency

Confirming an already-`confirmed` order is `ORDER_ALREADY_CONFIRMED`
(BR-ORDER-005) — **unless** it is a replay of the same command, which the
idempotency layer intercepts before the domain sees it and answers with the
original result (BR-COMMAND-001). The distinction matters: a genuine second
attempt by a confused user is an error; a network retry is not.

## Correction path

A confirmed order is never deleted and never silently edited (BR-ORDER-008). In
this phase, correcting one means `AdjustCustomerDebt` with a reason
(CASE-ORDER-007). A proper `CancelOrder` / `AmendOrder` command is future work.

## Related

- [state-catalog.md](state-catalog.md), [transition-catalog.md](transition-catalog.md)
- [../04-business-rules/order-rules.md](../04-business-rules/order-rules.md)
- [../02-use-cases/UC-ORDER-001-create-and-confirm-order.md](../02-use-cases/UC-ORDER-001-create-and-confirm-order.md)
