# Command contracts

Source of truth in code: `packages/domain-contracts/src/*/index.ts`.
Transport: tRPC v11, `apps/api/src/infrastructure/trpc/router.ts`.

## Envelope

Every write carries the same envelope. There is no generic `update` mutation, no
`patch`, and no endpoint that takes a status as an argument ([ADR-0002](../09-decisions/ADR-0002-command-based-writes.md)).

```ts
{
  commandId: string;          // uuid — identity of this attempt
  idempotencyKey: string;     // 8–200 chars — retry token, client-supplied
  expectedVersion?: number;   // required for commands that change an aggregate
  workspaceId: string;        // uuid — tenant boundary, checked before any read
  actorId: string;            // uuid — who is accountable
  occurredAt: string;         // ISO-8601 with offset — when it actually happened
  payload: { … };             // per-command
}
```

`expectedVersion` is mandatory on `ConfirmOrder` and `ReverseCustomerPayment`
(they change existing aggregates) and absent from the four creation commands.

## The six commands

| Command                  | tRPC procedure    | Payload                                                                     | Versioned | Returns                  | Ledger effect |
| ------------------------ | ----------------- | --------------------------------------------------------------------------- | --------- | ------------------------ | ------------- |
| `CreateCustomer`         | `customer.create` | `customerId`, `displayName`, `phone?`, `note?`                              | no        | `CustomerDto`            | none          |
| `CreateOrder`            | `order.create`    | `orderId`, `customerId`, `currency`, `lines[]`, `note?`                     | no        | `OrderDto`               | none          |
| `ConfirmOrder`           | `order.confirm`   | `orderId`                                                                   | **yes**   | `OrderDto`               | `+total`      |
| `RecordCustomerPayment`  | `payment.record`  | `paymentId`, `customerId`, `amount`, `method`, `payerName?`, `note?`        | no        | `PaymentDto`             | `−amount`     |
| `ReverseCustomerPayment` | `payment.reverse` | `paymentId`, `reversalId`, `amount`, `reason`                               | **yes**   | `PaymentDto`             | `+amount`     |
| `AdjustCustomerDebt`     | `debt.adjust`     | `adjustmentId`, `customerId`, `direction`, `amount`, `reasonCode`, `reason` | no        | `CustomerDebtSummaryDto` | `±amount`     |

Queries: `order.byId`, `payment.byId`, `debt.summary`, `debt.ledger`, `audit.byAggregate`.

## Client-supplied identifiers

Every command that creates something carries the new id in its payload:
`customerId`, `orderId`, `lineId`, `paymentId`, `reversalId`, `adjustmentId`.

Three reasons, in order of importance:

1. **Offline capture.** A worker with no signal must be able to create a customer
   and immediately attach an order to them. That requires an id before the server
   has seen either.
2. **Retry safety.** A replay carries the same ids, so a duplicate is
   structurally impossible rather than merely detected.
3. **A pure domain kernel.** Decision functions generate nothing — no UUIDs, no
   timestamps. Same input, same output, always ([ADR-0003](../09-decisions/ADR-0003-backend-owns-business-rules.md)).

## Money and quantity on the wire

```ts
amount:   { amountMinor: 875000, currency: "VND" }        // 875.000 ₫
quantity: { valueScaled: 12500, unit: "kg" }              // 12,5 kg
```

Integers only. A client that sends `875000.0` is sending a float and will be
rejected by the schema. See [ADR-0006](../09-decisions/ADR-0006-integer-minor-units-for-money.md).

## Execution pipeline

Every state-changing command runs the same eleven steps
(`apps/api/src/modules/shared/command-pipeline.ts`):

1. validate the payload schema → `INVALID_COMMAND_PAYLOAD`
2. authorize workspace membership → `WORKSPACE_ACCESS_DENIED`
3. reject a future `occurredAt` → `TRANSACTION_TIME_IN_FUTURE`
4. check the idempotency record → replay returns the original result
5. **open the transaction**
6. load the aggregate (`SELECT … FOR UPDATE`)
7. check `expectedVersion` → `*_VERSION_CONFLICT`
8. call the pure domain decision function
9. persist: aggregate, ledger entries, summary, audit record
10. write the command receipt
11. **commit**, then map to a DTO

Steps 5–11 are one database transaction (BR-COMMAND-005). A failure anywhere
leaves no partial effect.

## Related

- [error-contract.md](error-contract.md)
- [capabilities.md](capabilities.md)
- [../04-business-rules/debt-rules.md](../04-business-rules/debt-rules.md)
