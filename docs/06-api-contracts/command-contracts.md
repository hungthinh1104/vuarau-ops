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

`actorId` is **checked**, not trusted: it must equal the actor the bearer token
resolved to, or the command is refused with `ACTOR_IMPERSONATION_DENIED`
(BR-AUTH-002). Every request carries `Authorization: Bearer <token>`, and the
required permission per command is listed in
[authorization-rules.md](../04-business-rules/authorization-rules.md).

`expectedVersion` is mandatory on every command that changes an aggregate somebody
else may be looking at — `PostSale`, `UpdateSaleDraft`, `DiscardSaleDraft`,
`ReverseCustomerPayment`, `UpdateCustomer`, `DeactivateCustomer` — and absent from
the creation commands.

It is absent from **`RevokeWorkspaceMembership`** too. A membership has no
user-editable content to lose an update of, and two concurrent revocations of the
same person want the same end state. The race that does matter — two owners
revoking each other at once — touches different rows, so a version would not catch
it; the active-owner count is read under a row lock instead (BR-AUTH-007).

It is also absent from **`VoidSale`**, which is the interesting case: a posted sale
is immutable, so its version never moves again, and there is no lost update to
guard against. Demanding a token the caller cannot affect would be theatre.
Concurrent voids are serialised by a row lock and refused by `UNIQUE (sale_id)` on
`sale_voids` (BR-SALE-013).

## The seven money commands

These are the ones that move a balance, or could be mistaken for a command that
does. Everything about the system's caution is aimed here.

| Command                  | tRPC procedure     | Payload                                                                             | Versioned | Returns                     | Account effect |
| ------------------------ | ------------------ | ----------------------------------------------------------------------------------- | --------- | --------------------------- | -------------- |
| `CreateCustomer`         | `customer.create`  | `customerId`, `displayName`, `phone?`, `note?`                                      | no        | `CustomerDto`               | none           |
| `CreateSaleDraft`        | `sale.createDraft` | `saleId`, `customerId`, `currency`, `lines[]`, `note?`, `dueAt?`, `replacesSaleId?` | no        | `SaleDto`                   | **none**       |
| `PostSale`               | `sale.post`        | `saleId`                                                                            | **yes**   | `SaleDto`                   | `+total`       |
| `VoidSale`               | `sale.void`        | `saleVoidId`, `saleId`, `reasonCode`, `reason`                                      | no        | `SaleDto`                   | `−total`       |
| `RecordCustomerPayment`  | `payment.record`   | `paymentId`, `customerId`, `amount`, `method`, `payerName?`, `note?`                | no        | `PaymentDto`                | `−amount`      |
| `ReverseCustomerPayment` | `payment.reverse`  | `paymentId`, `reversalId`, `amount`, `reason`                                       | **yes**   | `PaymentDto`                | `+amount`      |
| `AdjustCustomerDebt`     | `debt.adjust`      | `adjustmentId`, `customerId`, `direction`, `amount`, `reasonCode`, `reason`         | no        | `CustomerAccountBalanceDto` | `±amount`      |

## The five lifecycle commands

Same envelope, same idempotency, same audit record — and **no account effect at
all**, which is the property each of their tests asserts directly rather than
assuming. A draft that is edited five times and then thrown away must leave the
customer's balance exactly where it found it (BR-SALE-010).

| Command                     | tRPC procedure             | Payload                                        | Versioned | Returns                  |
| --------------------------- | -------------------------- | ---------------------------------------------- | --------- | ------------------------ |
| `UpdateCustomer`            | `customer.update`          | `customerId`, `displayName`, `phone?`, `note?` | **yes**   | `CustomerDto`            |
| `DeactivateCustomer`        | `customer.deactivate`      | `customerId`, `reason?`                        | **yes**   | `CustomerDto`            |
| `UpdateSaleDraft`           | `sale.updateDraft`         | `saleId`, `lines[]`, `note?`, `dueAt?`         | **yes**   | `SaleDto`                |
| `DiscardSaleDraft`          | `sale.discardDraft`        | `saleId`, `reason?`                            | **yes**   | `SaleDto`                |
| `RevokeWorkspaceMembership` | `session.revokeMembership` | `actorId`, `reason?`                           | no        | `WorkspaceMembershipDto` |

There is no `updateEntity`, no `updateSaleStatus`, no `patchCustomerDebt`, and no
`setPaymentStatus`. There is also no `CancelSale`: a draft is discarded and a
posted sale is voided, and those are different events with different money
([ADR-0012](../09-decisions/ADR-0012-sale-void-and-replacement.md)).

Queries: `session.me`, `customer.search`, `customer.get`, `sale.get`, `sale.list`,
`payment.get`, `payment.list`, `account.balance`, `account.timeline`,
`audit.timeline`. Reads are authorized exactly like commands (BR-AUTH-001), and
every list is cursor-paged — there is no unbounded read
([read models](read-models.md)).

### Notable payload absences

| Command    | What it does **not** take | Why                                                                      |
| ---------- | ------------------------- | ------------------------------------------------------------------------ |
| `PostSale` | lines, total              | Posting commits what is stored; a stale screen must not set the total    |
| `VoidSale` | amount                    | Compensation comes from the stored posted total, so it cannot be steered |
| `VoidSale` | `expectedVersion`         | A posted sale's version never moves                                      |

## Client-supplied identifiers

Every command that creates something carries the new id in its payload:
`customerId`, `saleId`, `lineId`, `paymentId`, `reversalId`, `saleVoidId`,
`adjustmentId`.

Three reasons, in order of importance:

1. **Offline capture.** A worker with no signal must be able to create a customer
   and immediately attach a sale to them. That requires an id before the server
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
2. authorize: identity, membership, activity, permission → `ACTOR_IMPERSONATION_DENIED`,
   `WORKSPACE_ACCESS_DENIED`, `WORKSPACE_MEMBERSHIP_INACTIVE`, `PERMISSION_DENIED`
   (see [UC-AUTH-001](../02-use-cases/UC-AUTH-001-authenticate-and-authorize.md))
3. reject a future `occurredAt` → `TRANSACTION_TIME_IN_FUTURE`
4. check the idempotency record → replay returns the original result
5. **open the transaction**
6. load the aggregate (`SELECT … FOR UPDATE`)
7. check `expectedVersion` → `*_VERSION_CONFLICT`
8. call the pure domain decision function
9. persist: aggregate, account entries, balance, audit record
10. write the command receipt
11. **commit**, then map to a DTO

Steps 5–11 are one database transaction (BR-COMMAND-005). A failure anywhere
leaves no partial effect.

## Related

- [error-contract.md](error-contract.md)
- [capabilities.md](capabilities.md)
- [../04-business-rules/customer-account-rules.md](../04-business-rules/customer-account-rules.md)
