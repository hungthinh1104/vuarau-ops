# UC-PAYMENT-002 — Reverse a customer payment

**Risk:** P0 · **Status:** implemented · **Command:** `ReverseCustomerPayment`

## Intent

A payment was recorded wrongly — wrong customer, wrong amount, a bounced transfer.
The depot undoes its financial effect **without erasing the fact that it happened**.

## Actor

Any authenticated member of the workspace.

## Preconditions

- The payment exists in the workspace.
- The caller knows the payment's current `version`.
- Client has generated `reversalId`.

## Main flow

1. Client sends `ReverseCustomerPayment`: `paymentId`, `reversalId`, `amount`,
   `reason`, optional source `evidenceReferences`, and `expectedVersion`.
2. Backend loads the payment for update inside a transaction.
3. Backend checks `expectedVersion` (BR-PAYMENT-007).
4. Domain checks: payment is not already fully reversed (BR-PAYMENT-006), amount is
   positive (BR-PAYMENT-001), amount ≤ `amount − reversedAmount` (BR-PAYMENT-003),
   reason is non-blank (BR-PAYMENT-004).
5. Domain produces:
   - a `payment_reversals` record — **not** a second payment (BR-PAYMENT-005);
   - an updated payment with `reversedAmount += amount` and a status derived from
     it (BR-PAYMENT-008);
   - **exactly one** compensating ledger entry of `+amount`,
     `sourceType = payment_reversal`, `sourceId = reversalId`,
     `reversalOfEntryId` pointing at the original payment's entry.
6. Backend commits all of it in one transaction and returns the updated `PaymentDto`.

The original payment row and the original ledger entry are untouched. Both remain
visible in history.

Reversal evidence references explain the observed correction and remain metadata;
they do not alter the compensating amount or debt allocation.

## Alternate flows

| Situation                                      | Outcome                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Payment not found in this workspace            | `PAYMENT_NOT_FOUND`                                                                         |
| Payment already fully reversed                 | `PAYMENT_ALREADY_REVERSED` (BR-PAYMENT-006)                                                 |
| Amount exceeds the remaining reversible amount | `PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT`, with `remaining` in `details` (BR-PAYMENT-003) |
| Blank reason                                   | `PAYMENT_REVERSAL_REASON_REQUIRED` (BR-PAYMENT-004)                                         |
| `expectedVersion` stale                        | `PAYMENT_VERSION_CONFLICT` (BR-PAYMENT-007)                                                 |
| Reversal command submitted twice               | Original result; exactly one compensating entry (CASE-PAYMENT-011, BR-COMMAND-001)          |
| Reversing part of the amount                   | Allowed; status becomes `partially_reversed` (ASM-006, CASE-PAYMENT-010)                    |

## Postconditions

- One `payment_reversals` row per successful reversal.
- Exactly one compensating ledger entry per successful reversal.
- Payment `reversedAmount` increased; status `partially_reversed` or `reversed`.
- Debt summary increased by exactly the reversed amount.
- Original payment and its ledger entry unchanged.

## Business rules

BR-PAYMENT-001, BR-PAYMENT-003, BR-PAYMENT-004, BR-PAYMENT-005, BR-PAYMENT-006,
BR-PAYMENT-007, BR-PAYMENT-008, BR-COMMAND-001, BR-COMMAND-005, BR-ACCOUNT-005

## Cases

CASE-PAYMENT-009, CASE-PAYMENT-010, CASE-PAYMENT-011

## Tests

TC-PAYMENT-004, TC-PAYMENT-005, TC-PAYMENT-006, TC-PAYMENT-007, TC-PAYMENT-008,
TC-PAYMENT-009, TC-PAYMENT-010

## Implementation

- `packages/domain-kernel/src/payment/reverse-payment.ts`
- `apps/api/src/modules/payment/reverse-payment.handler.ts`
