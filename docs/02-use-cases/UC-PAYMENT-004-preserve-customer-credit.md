# UC-PAYMENT-004 — Preserve an unallocated Payment as customer credit

**Risk:** P0 · **Status:** implemented · **Command:**
`PreserveCustomerPaymentAsCredit`

## Intent

An operator deliberately retains part of one recorded Payment for the same
customer's future purchase. This is a financial attribution of already-received
money, not a generic observation and not a second payment, refund or customer
ledger entry.

## Preconditions

- The caller is an active workspace member with `debt.allocate`.
- The Payment exists in the workspace and its current `version` is supplied.
- Amount is positive, has the Payment currency and does not exceed the live
  unallocated amount after reversals, active allocations and active preservation
  tips.
- A correction names a current preservation tip for the same Payment.

## Main flow

1. Client sends `PreserveCustomerPaymentAsCredit` with a new preservation ID,
   Payment ID, amount, reason and source references.
2. Backend locks the Payment and, for correction, the predecessor fact; it reads
   allocation/reversal and preservation facts in the same transaction.
3. The shared `derivePaymentExposure` kernel calculates current availability.
4. Backend appends `customer_payment_credit_preservations` and audit action
   `payment.customer_credit_preserved`, then stores the command receipt.
5. The Payment lifecycle, cash and customer-account ledger remain unchanged.

## Alternate flows

| Situation                                                              | Outcome                                                                                |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Evidence-only actor attempts the legacy observation kind               | `CUSTOMER_CREDIT_PRESERVATION_REQUIRES_FINANCIAL_COMMAND`; no fact or audit is written |
| Amount exceeds live availability                                       | `CUSTOMER_CREDIT_PRESERVATION_EXCEEDS_UNALLOCATED`                                     |
| Correction target is missing, already corrected or for another Payment | stable target/link rejection; no append                                                |
| Command replay                                                         | original preservation returns through command idempotency                              |

## Postconditions

- Exactly one append-only financial preservation row and one audit record.
- No `customer_account_entries` or cash row is added.
- Only active correction-chain tips reduce `payment_exposure_v1.availableAmountMinor`.
- A later allocation or reversal is refused if it would consume a preserved amount.

## Business rules

BR-PAYMENT-009, BR-COMMAND-001, BR-COMMAND-002, BR-AUTH-001, BR-AUTH-004,
BR-CUSTOMER-002

## Tests

TC-PAYMENT-014, TC-PAYMENT-015, TC-OPS-024, TC-OPS-027, TC-OPS-028

## Implementation

- `packages/domain-kernel/src/payment/customer-credit-preservation.ts`
- `apps/api/src/modules/payment/customer-credit-preservation.handler.ts`
- `packages/db/src/schema/payment.ts`
- `packages/db/src/repositories/write/customer-payment-credit-preservation.ts`
- `apps/web/src/ui/controllers/payment-detail-controller.tsx`
