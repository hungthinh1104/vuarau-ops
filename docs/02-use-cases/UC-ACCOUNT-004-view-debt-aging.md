# UC-ACCOUNT-004 — View policy-backed customer debt aging

**Risk:** P0 · **Status:** implemented · **Read:** `account.aging`

## Intent

Answer which posted, non-voided sales remain outstanding, which are overdue,
which payments are allocated, and which money is still unallocated. The read is
derived from the customer account ledger plus immutable sale/payment facts; it is
not a second balance source.

## Preconditions

- The caller is an active workspace member with `debt.read`.
- An approved, effective `payment_terms_aging` policy exists.
- An approved, effective `payment_allocation` policy exists.

If either policy is missing or invalid, the result is `unavailable` with explicit
diagnostics. No global term, bucket, or allocation strategy is inferred.

## Main flow

1. Authorize `workspaceId` and `customerId` in one read transaction.
2. Resolve the highest approved policy version effective at `asOf`.
3. Read posted sales, payments, reversals, and account ledger entries scoped to
   the workspace and customer.
4. Calculate deterministic rows using the configured allocation strategy.
5. Return policy version IDs, source references, totals, calculation version and
   integrity diagnostics.

The current supported automatic strategies are `oldest_due_first` and
`oldest_transaction_first`. `manual` and `specific_sale` are available when
append-only allocation records exist; missing records remain unavailable rather
than being inferred from UI state.

## Business rules

BR-AGING-001, BR-AGING-002, BR-AGING-003, BR-POLICY-003, BR-POLICY-005,
BR-AUTH-001, BR-AUTH-004, BR-CUSTOMER-002

## Tests

TC-AGING-001, TC-AGING-002, TC-AGING-003, TC-AGING-004

## Implementation

- `packages/domain-contracts/src/debt/index.ts`
- `packages/domain-kernel/src/debt/index.ts`
- `apps/api/src/modules/account/account.queries.ts`
- `apps/api/src/infrastructure/trpc/routers/customer.ts`
- `packages/db/src/repositories/read/account.ts`
- `apps/api/src/modules/account/payment-allocation.handlers.ts`
- `packages/db/src/schema/payment.ts`

Explicitly not included: promise-to-pay, disputes, collection action history, and
credit-control enforcement remain separate slices.
