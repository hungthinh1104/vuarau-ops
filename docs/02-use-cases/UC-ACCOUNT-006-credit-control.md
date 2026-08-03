# UC-ACCOUNT-006 — Apply explicit customer credit control at Sale posting

**Risk:** P0 · **Status:** implemented · **Command boundary:** `sale.post`

## Intent

Allow a workspace to activate deterministic credit control without inventing a
limit for depots that have not configured one.

## Preconditions

- The caller is authorized to post the Sale.
- The Sale customer belongs to the target workspace.
- If credit control is active, an approved effective `credit_limit` policy is
  selected at the Sale's business time.

An absent policy leaves this optional capability inactive. It never supplies a
global default.

## Main flow

1. Lock the Sale and the target customer inside the posting transaction.
2. Recalculate the Sale total from canonical line snapshots.
3. Read the customer's canonical account entries and calculate the integer
   current balance.
4. Apply the selected policy strategy.
5. If allowed, post the Sale and its one account entry atomically, storing the
   credit policy version on the Sale. If refused, leave the Sale as a draft and
   write no financial effect.

`information_only` is supported as an allowed, lineage-bearing strategy.
`hard_block` is supported for a non-negative same-currency limit.
`warning` and `approval_required` are unavailable until their approval/notice
workflow is implemented; they fail closed rather than silently allowing a
sale.

## Business rules

BR-CREDIT-001, BR-SALE-001, BR-SALE-006, BR-SALE-007, BR-COMMAND-001,
BR-COMMAND-005, BR-AUTH-001, BR-AUTH-004, BR-CUSTOMER-002

## Tests

TC-CREDIT-001, TC-CREDIT-002, TC-CREDIT-003, TC-CREDIT-004

## Implementation

- `packages/domain-contracts/src/policy/index.ts`
- `packages/domain-kernel/src/debt/credit-limit.ts`
- `apps/api/src/modules/sale/post-sale.handler.ts`
- `apps/api/src/modules/payment/record-payment.handler.ts`
- `apps/api/src/modules/payment/reverse-payment.handler.ts`
- `apps/api/src/modules/account/adjust-debt.handler.ts`
- `apps/api/src/modules/sale/void-sale.handler.ts`
- `packages/db/src/schema/sale.ts`
- `packages/db/src/repositories/write/sale.ts`
- `apps/web/src/ui/copy.ts`
