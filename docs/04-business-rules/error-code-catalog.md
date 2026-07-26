# Error code catalog

Source of truth in code:
`packages/domain-contracts/src/shared/rejection-codes.ts`.

These strings are API. **A code is never renamed and never reused.** A code that
stops being produced is marked deprecated here and left in the enum until every
client has stopped reading it.

Clients branch on `code`. Clients never branch on `message` — messages will be
translated to Vietnamese and rewritten for tone.

## Envelope

```ts
{ code: DomainRejectionCode; message: string; details?: Record<string, unknown>; retryable: boolean }
```

`retryable` is a property of the code, not of the call site
(`isRetryableCode`), so two handlers cannot disagree about whether the same
failure is worth retrying.

## Catalog

| Code                                            | Meaning                                                   | `details`                          | Retryable | Rule            | HTTP / tRPC           |
| ----------------------------------------------- | --------------------------------------------------------- | ---------------------------------- | --------- | --------------- | --------------------- |
| `WORKSPACE_ACCESS_DENIED`                       | Actor is not a member of the target workspace             | `workspaceId`                      | no        | BR-CUSTOMER-002 | `FORBIDDEN`           |
| `CUSTOMER_NOT_FOUND`                            | No such customer in this workspace                        | `customerId`                       | no        | —               | `NOT_FOUND`           |
| `CUSTOMER_NAME_REQUIRED`                        | Display name blank after trimming                         | —                                  | no        | BR-CUSTOMER-001 | `BAD_REQUEST`         |
| `ORDER_NOT_FOUND`                               | No such order in this workspace                           | `orderId`                          | no        | —               | `NOT_FOUND`           |
| `ORDER_EMPTY`                                   | Confirming an order with no lines                         | `orderId`                          | no        | BR-ORDER-002    | `BAD_REQUEST`         |
| `ORDER_LINE_INVALID`                            | A line failed validation                                  | `lineIndex`, `lineId`, `problem`   | no        | BR-ORDER-003    | `BAD_REQUEST`         |
| `ORDER_ALREADY_CONFIRMED`                       | Order is already `confirmed`                              | `orderId`, `status`                | no        | BR-ORDER-005    | `CONFLICT`            |
| `ORDER_CANCELLED`                               | Order is `cancelled`; no further transitions              | `orderId`                          | no        | —               | `CONFLICT`            |
| `ORDER_VERSION_CONFLICT`                        | `expectedVersion` ≠ stored version                        | `expectedVersion`, `actualVersion` | no¹       | BR-ORDER-006    | `CONFLICT`            |
| `ORDER_CURRENCY_MISMATCH`                       | A line's currency differs from the order's                | `lineId`, `expected`, `actual`     | no        | BR-ORDER-009    | `BAD_REQUEST`         |
| `PAYMENT_AMOUNT_INVALID`                        | Amount ≤ 0                                                | `amountMinor`                      | no        | BR-PAYMENT-001  | `BAD_REQUEST`         |
| `PAYMENT_NOT_FOUND`                             | No such payment in this workspace                         | `paymentId`                        | no        | —               | `NOT_FOUND`           |
| `PAYMENT_ALREADY_REVERSED`                      | Payment is fully reversed (terminal)                      | `paymentId`                        | no        | BR-PAYMENT-006  | `CONFLICT`            |
| `PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT`     | Requested > remaining reversible                          | `requested`, `remaining`           | no        | BR-PAYMENT-003  | `BAD_REQUEST`         |
| `PAYMENT_REVERSAL_REASON_REQUIRED`              | Reason blank after trimming                               | —                                  | no        | BR-PAYMENT-004  | `BAD_REQUEST`         |
| `PAYMENT_VERSION_CONFLICT`                      | `expectedVersion` ≠ stored version                        | `expectedVersion`, `actualVersion` | no¹       | BR-PAYMENT-007  | `CONFLICT`            |
| `PAYMENT_CURRENCY_MISMATCH`                     | Payment currency ≠ ledger currency                        | `expected`, `actual`               | no        | —               | `BAD_REQUEST`         |
| `DEBT_ADJUSTMENT_REASON_REQUIRED`               | Reason blank after trimming                               | —                                  | no        | BR-DEBT-003     | `BAD_REQUEST`         |
| `DEBT_ADJUSTMENT_AMOUNT_INVALID`                | Amount ≤ 0                                                | `amountMinor`                      | no        | BR-DEBT-008     | `BAD_REQUEST`         |
| `DUPLICATE_COMMAND`                             | `commandId` already used with a different idempotency key | `commandId`                        | no        | BR-COMMAND-001  | `CONFLICT`            |
| `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD` | Same key, different payload hash                          | `idempotencyKey`                   | no        | BR-COMMAND-002  | `CONFLICT`            |
| `COMMAND_IN_PROGRESS`                           | An identical command is still executing                   | `idempotencyKey`                   | **yes**   | BR-COMMAND-001  | `CONFLICT`            |
| `INVALID_COMMAND_PAYLOAD`                       | Zod schema rejected the payload                           | `issues`                           | no        | —               | `BAD_REQUEST`         |
| `TRANSACTION_TIME_IN_FUTURE`                    | `occurredAt` beyond the 5-minute skew tolerance           | `occurredAt`, `serverTime`         | no        | BR-COMMAND-004  | `BAD_REQUEST`         |
| `COMMAND_NOT_AVAILABLE`                         | Capability exists in the model but not in this phase      | `command`                          | no        | —               | n/a — capability only |

¹ A version conflict is _not_ retryable with the same payload: the client must
re-read the aggregate and let the user decide. Blind retry would reintroduce the
lost update the check exists to prevent.

## Rules for changing this catalog

1. Adding a code: append to the enum, add a row here, name the rule it serves.
2. Retiring a code: mark **deprecated** in both places with the date and the code
   that replaces it. Leave it in the enum.
3. Never change what an existing code means. A client in the field is reading it.

## Deprecated codes

None yet.

## Related

- [../06-api-contracts/error-contract.md](../06-api-contracts/error-contract.md)
- [../06-api-contracts/capabilities.md](../06-api-contracts/capabilities.md)
