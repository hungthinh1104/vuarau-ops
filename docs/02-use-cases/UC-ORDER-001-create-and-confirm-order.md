# UC-ORDER-001 — Create and confirm an order

**Risk:** P0 · **Status:** implemented · **Commands:** `CreateOrder`, `ConfirmOrder`

## Intent

A worker records what a customer is taking, then commits it. Confirmation is the
moment the customer starts owing money, so it is the most financially significant
action in the slice.

## Actor

Any authenticated member of the workspace.

## Preconditions

- Customer exists in the workspace.
- Client has generated `orderId` and one `lineId` per line.

## Main flow — CreateOrder

1. Client sends `CreateOrder` with `customerId`, `currency`, and zero or more lines.
2. Backend validates the schema and that the customer exists.
3. Backend computes each `lineTotal` and the order total (BR-ORDER-001, BR-ORDER-004).
4. Backend stores the order as `draft`, `version = 1`,
   `transactionTime = command.occurredAt`, `recordedAt = now`.
5. Backend returns `OrderDto` including `capabilities`.

A draft may be empty. The worker is still typing; that is not an error yet.

## Main flow — ConfirmOrder

1. Client sends `ConfirmOrder` with `orderId` and `expectedVersion`.
2. Backend loads the order for update within a transaction.
3. Backend checks `expectedVersion` against the stored version (BR-ORDER-006).
4. Domain decides: status must be `draft`, at least one line (BR-ORDER-002), every
   line valid (BR-ORDER-003), all currencies consistent (BR-ORDER-009).
5. Domain emits **exactly one** ledger effect: `+totalAmount`,
   `sourceType = order_confirmation`, `sourceId = orderId`,
   `transactionTime = command.occurredAt` (BR-ORDER-007).
6. Backend, in one transaction: updates the order to `confirmed` at `version + 1`,
   appends the ledger entry, updates the debt summary projection, writes the audit
   record, and stores the command receipt.
7. Backend returns the updated `OrderDto`.

## Alternate flows

| Situation                                    | Outcome                                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| Order has no lines                           | `ORDER_EMPTY` (BR-ORDER-002)                                                  |
| A line has zero quantity or a negative price | `ORDER_LINE_INVALID` (BR-ORDER-003)                                           |
| A line's currency differs from the order's   | `ORDER_CURRENCY_MISMATCH` (BR-ORDER-009)                                      |
| Order already confirmed                      | `ORDER_ALREADY_CONFIRMED` (BR-ORDER-005)                                      |
| Order cancelled                              | `ORDER_CANCELLED`                                                             |
| `expectedVersion` stale                      | `ORDER_VERSION_CONFLICT` (BR-ORDER-006)                                       |
| Same confirm command retried after a timeout | Original result, debt unchanged (BR-COMMAND-001)                              |
| Sale happened yesterday, entered today       | Accepted; `transactionTime` is yesterday, `recordedAt` today (BR-COMMAND-003) |
| `occurredAt` in the future                   | `TRANSACTION_TIME_IN_FUTURE` (BR-COMMAND-004)                                 |

## Postconditions

- Order is `confirmed`, version incremented.
- Exactly one new ledger entry, amount `+total`.
- Debt summary balance increased by exactly `total`.
- One audit record `order.confirmed`.
- A confirmed order is never deleted (BR-ORDER-008). Correcting it is
  CASE-ORDER-007.

## Business rules

BR-ORDER-001 … BR-ORDER-009, BR-COMMAND-001, BR-COMMAND-003, BR-COMMAND-004,
BR-COMMAND-005, BR-DEBT-002, BR-DEBT-004

## Cases

CASE-ORDER-001 … CASE-ORDER-007

## Tests

TC-ORDER-001 … TC-ORDER-011

## Implementation

- `packages/domain-kernel/src/order/create-order.ts`
- `packages/domain-kernel/src/order/confirm-order.ts`
- `apps/api/src/modules/order/create-order.handler.ts`
- `apps/api/src/modules/order/confirm-order.handler.ts`

## Open questions

- Debt is created at confirmation, not delivery or invoicing (ASM-002).
- Cancelling a confirmed order is documented but not implemented (ASM-005).
