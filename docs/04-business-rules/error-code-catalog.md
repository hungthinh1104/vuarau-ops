# Error code catalog

Source of truth in code:
`packages/domain-contracts/src/shared/rejection-codes.ts`.

These strings are API. **A code is never reused for a different meaning.** A code
that stops being produced is marked deprecated here.

Clients branch on `code`. Clients never branch on `message` — messages will be
translated to Vietnamese and rewritten for tone.

## Envelope

```ts
{ code: DomainRejectionCode; message: string; details?: Record<string, unknown>; retryable: boolean }
```

`retryable` is a property of the code, not of the call site (`isRetryableCode`), so
two handlers cannot disagree about whether the same failure is worth retrying.

## Catalog

| Code                                            | Meaning                                                                                                                | `details`                                | Retryable | Rule                     | HTTP / tRPC           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------- | ------------------------ | --------------------- |
| `AUTHENTICATION_REQUIRED`                       | No bearer token was presented                                                                                          | —                                        | no        | BR-AUTH-001              | `UNAUTHORIZED`        |
| `AUTHENTICATION_INVALID`                        | Token failed verification. **Never says why** — expired, forged and wrong-audience are indistinguishable to the caller | —                                        | no        | BR-AUTH-001              | `UNAUTHORIZED`        |
| `ACTOR_NOT_FOUND`                               | Token verified, but its subject maps to no actor here                                                                  | `subject`                                | no        | BR-AUTH-005              | `FORBIDDEN`           |
| `ACTOR_IMPERSONATION_DENIED`                    | `command.actorId` is not the authenticated actor                                                                       | `claimedActorId`, `authenticatedActorId` | no        | BR-AUTH-002              | `FORBIDDEN`           |
| `WORKSPACE_ACCESS_DENIED`                       | Actor is not a member of the target workspace                                                                          | `workspaceId`                            | no        | BR-CUSTOMER-002          | `FORBIDDEN`           |
| `WORKSPACE_MEMBERSHIP_INACTIVE`                 | Membership exists but was revoked. Distinct from the row above because the operator's remedy differs                   | `workspaceId`                            | no        | BR-AUTH-003              | `FORBIDDEN`           |
| `PERMISSION_DENIED`                             | Active member, but their role lacks the permission                                                                     | `permission`, `role`, `workspaceId`      | no        | BR-AUTH-004, BR-AUTH-006 | `FORBIDDEN`           |
| `CUSTOMER_NOT_FOUND`                            | No such customer in this workspace                                                                                     | `customerId`                             | no        | —                        | `NOT_FOUND`           |
| `CUSTOMER_NAME_REQUIRED`                        | Display name blank after trimming                                                                                      | —                                        | no        | BR-CUSTOMER-001          | `BAD_REQUEST`         |
| `SALE_NOT_FOUND`                                | No such sale in this workspace                                                                                         | `saleId`                                 | no        | —                        | `NOT_FOUND`           |
| `SALE_EMPTY`                                    | Posting a sale with no lines                                                                                           | `saleId`                                 | no        | BR-SALE-002              | `BAD_REQUEST`         |
| `SALE_LINE_INVALID`                             | A line failed validation                                                                                               | `lineIndex`, `lineId`, `problem`         | no        | BR-SALE-003              | `BAD_REQUEST`         |
| `SALE_ALREADY_POSTED`                           | Sale is already `posted`; drafts only from here                                                                        | `saleId`, `status`                       | no        | BR-SALE-005, BR-SALE-018 | `CONFLICT`            |
| `SALE_VERSION_CONFLICT`                         | `expectedVersion` ≠ stored version                                                                                     | `expectedVersion`, `actualVersion`       | no¹       | BR-SALE-006              | `CONFLICT`            |
| `SALE_CURRENCY_MISMATCH`                        | A line's currency differs from the sale's                                                                              | `lineId`, `expected`, `actual`           | no        | BR-SALE-009              | `BAD_REQUEST`         |
| `SALE_IMMUTABLE`                                | An update or delete was attempted against a posted sale                                                                | `saleId`                                 | no        | BR-SALE-008              | `CONFLICT`            |
| `SALE_NOT_POSTED`                               | Voiding a draft. Discard it instead                                                                                    | `saleId`, `status`                       | no        | BR-SALE-015              | `CONFLICT`            |
| `SALE_ALREADY_VOIDED`                           | A void record already exists for this sale                                                                             | `saleId`, `saleVoidId`                   | no        | BR-SALE-013              | `CONFLICT`            |
| `SALE_VOID_REASON_REQUIRED`                     | Void explanation blank after trimming                                                                                  | `saleId`                                 | no        | BR-SALE-014              | `BAD_REQUEST`         |
| `PAYMENT_AMOUNT_INVALID`                        | Amount ≤ 0                                                                                                             | `amountMinor`                            | no        | BR-PAYMENT-001           | `BAD_REQUEST`         |
| `PAYMENT_NOT_FOUND`                             | No such payment in this workspace                                                                                      | `paymentId`                              | no        | —                        | `NOT_FOUND`           |
| `PAYMENT_ALREADY_REVERSED`                      | Payment is fully reversed (terminal)                                                                                   | `paymentId`                              | no        | BR-PAYMENT-006           | `CONFLICT`            |
| `PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT`     | Requested > remaining reversible                                                                                       | `requested`, `remaining`                 | no        | BR-PAYMENT-003           | `BAD_REQUEST`         |
| `PAYMENT_REVERSAL_REASON_REQUIRED`              | Reason blank after trimming                                                                                            | —                                        | no        | BR-PAYMENT-004           | `BAD_REQUEST`         |
| `PAYMENT_VERSION_CONFLICT`                      | `expectedVersion` ≠ stored version                                                                                     | `expectedVersion`, `actualVersion`       | no¹       | BR-PAYMENT-007           | `CONFLICT`            |
| `PAYMENT_CURRENCY_MISMATCH`                     | Payment currency ≠ account currency                                                                                    | `expected`, `actual`                     | no        | —                        | `BAD_REQUEST`         |
| `DEBT_ADJUSTMENT_REASON_REQUIRED`               | Reason blank after trimming                                                                                            | —                                        | no        | BR-ACCOUNT-003           | `BAD_REQUEST`         |
| `DEBT_ADJUSTMENT_AMOUNT_INVALID`                | Amount ≤ 0                                                                                                             | `amountMinor`                            | no        | BR-ACCOUNT-008           | `BAD_REQUEST`         |
| `DUPLICATE_COMMAND`                             | `commandId` already used with a different idempotency key                                                              | `commandId`                              | no        | BR-COMMAND-001           | `CONFLICT`            |
| `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD` | Same key, different payload hash                                                                                       | `idempotencyKey`                         | no        | BR-COMMAND-002           | `CONFLICT`            |
| `COMMAND_IN_PROGRESS`                           | An identical command is still executing                                                                                | `idempotencyKey`                         | **yes**   | BR-COMMAND-001           | `CONFLICT`            |
| `INVALID_COMMAND_PAYLOAD`                       | Zod schema rejected the payload                                                                                        | `issues`                                 | no        | —                        | `BAD_REQUEST`         |
| `TRANSACTION_TIME_IN_FUTURE`                    | `occurredAt` beyond the 5-minute skew tolerance                                                                        | `occurredAt`, `serverTime`               | no        | BR-COMMAND-004           | `BAD_REQUEST`         |
| `COMMAND_NOT_AVAILABLE`                         | Capability exists in the model but its command does not. **Nothing returns it today**                                  | `command`                                | no        | —                        | n/a — capability only |

¹ A version conflict is _not_ retryable with the same payload: the client must
re-read the aggregate and let the user decide. Blind retry would reintroduce the
lost update the check exists to prevent.

## Lifecycle codes

Added with the customer, draft and membership lifecycle commands. In the enum, in
Postgres, and returned by a command that a test exercises.

| Code                        | Meaning                                           | Rule            | Use case        |
| --------------------------- | ------------------------------------------------- | --------------- | --------------- |
| `CUSTOMER_VERSION_CONFLICT` | `expectedVersion` ≠ stored version on a customer  | BR-CUSTOMER-004 | UC-CUSTOMER-004 |
| `CUSTOMER_ALREADY_INACTIVE` | Deactivating a customer who already is            | BR-CUSTOMER-003 | UC-CUSTOMER-005 |
| `SALE_ALREADY_DISCARDED`    | Editing, discarding or posting a discarded draft  | BR-SALE-018     | UC-SALE-001     |
| `WORKSPACE_LAST_OWNER`      | Revoking the only remaining active owner. Refused | BR-AUTH-007     | UC-AUTH-002     |

## Rules for changing this catalog

1. Adding a code: append to the enum, add a row here, name the rule it serves.
2. Retiring a code: mark **deprecated** below with the date and its replacement.
3. Never change what an existing code means. A client in the field is reading it.

## Deprecated codes

Retired when the `Order` → `Sale` terminology closed, 2026-07-26.

| Retired                   | Replaced by              | Change                                                                                                                                      |
| ------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORDER_NOT_FOUND`         | `SALE_NOT_FOUND`         | Renamed                                                                                                                                     |
| `ORDER_EMPTY`             | `SALE_EMPTY`             | Renamed                                                                                                                                     |
| `ORDER_LINE_INVALID`      | `SALE_LINE_INVALID`      | Renamed                                                                                                                                     |
| `ORDER_ALREADY_CONFIRMED` | `SALE_ALREADY_POSTED`    | Renamed; now also covers editing a posted sale                                                                                              |
| `ORDER_VERSION_CONFLICT`  | `SALE_VERSION_CONFLICT`  | Renamed                                                                                                                                     |
| `ORDER_CURRENCY_MISMATCH` | `SALE_CURRENCY_MISMATCH` | Renamed                                                                                                                                     |
| `ORDER_CANCELLED`         | — none                   | **Removed.** The concept was split: a draft is discarded (`SALE_ALREADY_POSTED` guards it), a posted sale is voided (`SALE_ALREADY_VOIDED`) |

### Why these were renamed rather than aliased

The rule at the top of this document says a code is never renamed, and this is a
deliberate, one-time exception. It is recorded here rather than glossed over.

The rule exists to protect **clients in the field**. There are none: no UI is
built, no external consumer exists, and the repository holds no production data.
The cost of the exception is therefore zero today, and it will never be zero again
— every month that passes makes `ORDER_*` codes harder to remove and more likely to
be read by somebody as evidence that orders are still a concept in this system.

The alternative — `SALE_EMPTY` as an alias for `ORDER_EMPTY`, forever — leaves two
names for one refusal in the catalogue a client is meant to branch on, and the
question "which one do I handle?" has no good answer.

Retired codes are **not** removed from this table and must never be reissued for a
different meaning. The rule's substance holds: no string in this system has ever
meant two things.

## Related

- [../06-api-contracts/error-contract.md](../06-api-contracts/error-contract.md)
- [../06-api-contracts/capabilities.md](../06-api-contracts/capabilities.md)
- [../06-api-contracts/ui-state-catalog.md](../06-api-contracts/ui-state-catalog.md)
- [../02-use-cases/use-case-catalog.md](../02-use-cases/use-case-catalog.md)
