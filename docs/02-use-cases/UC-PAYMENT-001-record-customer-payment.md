# UC-PAYMENT-001 — Record a customer payment

**Risk:** P0 · **Status:** implemented · **Command:** `RecordCustomerPayment`

## Intent

A customer hands over money. The depot records it once — even if the phone
retries the request three times on a bad connection.

## Actor

Any authenticated member of the workspace.

## Preconditions

- Customer exists in the workspace.
- Client has generated `paymentId` and an `idempotencyKey`.

## Main flow

1. Client sends `RecordCustomerPayment`: `paymentId`, `customerId`, `amount`,
   `method`, optional `payerName`, `note` and source `evidenceReferences`.
2. Backend validates the schema; `amount.amountMinor` must be positive
   (BR-PAYMENT-001).
3. Backend checks the idempotency record. A replay of the same payload returns the
   original `PaymentDto` and touches nothing (BR-COMMAND-001).
4. Backend confirms the customer exists in the workspace.
5. Domain creates the payment: `status = recorded`, `reversedAmount = 0`,
   `version = 1`, and emits **exactly one** ledger effect of `−amount`,
   `sourceType = payment`, `sourceId = paymentId` (BR-PAYMENT-002).
6. Backend, in one transaction: inserts the payment, appends the ledger entry,
   updates the customer account balance, writes the audit record, stores the command receipt.
7. Backend returns `PaymentDto`.

## Alternate flows

| Situation                                            | Outcome                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Amount is zero or negative                           | `PAYMENT_AMOUNT_INVALID` (BR-PAYMENT-001)                                                                          |
| Customer not found in this workspace                 | `CUSTOMER_NOT_FOUND`                                                                                               |
| Currency differs from the customer's ledger currency | `PAYMENT_CURRENCY_MISMATCH`                                                                                        |
| Worker taps submit twice                             | One payment; second call returns the first result (CASE-PAYMENT-006)                                               |
| Client retries after a timeout                       | Same (CASE-PAYMENT-007)                                                                                            |
| Same key, different amount                           | `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD` (BR-COMMAND-002)                                                   |
| Payment exceeds current debt                         | **Accepted.** Balance goes negative — the customer is in credit (ASM-001, CASE-PAYMENT-003)                        |
| Payment recorded offline last night, submitted now   | Accepted; `transactionTime` is last night (CASE-PAYMENT-008)                                                       |
| Someone else paid on the customer's behalf           | Accepted; `payerName` records who handed over the money, the debt still belongs to `customerId` (CASE-PAYMENT-004) |

Source references are retained as attributable evidence only. They do not choose
payment allocation, due-date semantics or any additional cash effect.

## Postconditions

- Exactly one `payments` row.
- Exactly one ledger entry, amount `−amount`.
- Debt summary reduced by exactly that amount.
- One audit record `payment.recorded`.

## Allocation boundary

Recording a Payment never allocates it to a Sale. The payment reduces the
customer's canonical balance as a whole. A payment may remain unallocated, or a
separate approved `manual`/`specific_sale` allocation policy may add an append-only
attribution later without changing any ledger row.

## Business rules

BR-PAYMENT-001, BR-PAYMENT-002, BR-COMMAND-001, BR-COMMAND-002, BR-COMMAND-003,
BR-COMMAND-005, BR-ACCOUNT-002, BR-ACCOUNT-004

## Cases

CASE-PAYMENT-001 … CASE-PAYMENT-008

## Tests

TC-PAYMENT-001, TC-PAYMENT-002, TC-PAYMENT-003, TC-PAYMENT-011

## Implementation

- `packages/domain-kernel/src/payment/record-payment.ts`
- `apps/api/src/modules/payment/record-payment.handler.ts`
- `packages/domain-contracts/src/shared/evidence.ts`
