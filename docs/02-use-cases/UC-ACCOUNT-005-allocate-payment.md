# UC-ACCOUNT-005 — Allocate or reverse payment attribution

**Risk:** P0 · **Status:** implemented · **Commands:** `debt.allocate`

## Intent

Attribute received money to a specific posted sale for manual or specific-sale
debt aging. This is a commercial allocation fact; it never changes the customer
ledger, cashbook, payment amount, or payment reversal state.

## Preconditions

- The caller is an active workspace member with `debt.allocate`.
- An approved, effective `payment_allocation` policy allows `manual` or
  `specific_sale` at the command time.
- Payment and sale belong to the same workspace and customer.
- The sale is posted and not voided.

## Main flow

1. Lock the payment and sale in the command transaction.
2. Check expected payment version, currency, payment remaining amount and sale
   remaining amount.
3. Append one allocation record with command and actor evidence.
4. For correction, lock the allocation and append one bounded reversal record.
5. Re-run aging from payment, sale, allocation and reversal facts.

Retries return the original command result. A rejected or reversed attribution
does not create a second ledger effect.

## Business rules

BR-AGING-002, BR-AGING-004, BR-COMMAND-001, BR-COMMAND-002, BR-AUTH-001,
BR-AUTH-004, BR-CUSTOMER-002

## Tests

TC-AGING-004

## Implementation

- `packages/domain-kernel/src/debt/payment-allocation.ts`
- `apps/api/src/modules/account/payment-allocation.handlers.ts`
- `apps/api/src/infrastructure/trpc/routers/customer.ts`
- `packages/db/src/schema/payment.ts`
- `packages/db/src/repositories/write/payment-allocation.ts`
