# Credit control rules

Credit control is an optional, explicitly activated workspace capability. It
does not create a second debt balance: the customer account ledger remains the
canonical financial source.

### BR-CREDIT-001 — Credit control is typed, deterministic and fail-closed

At Sale posting, the application resolves the effective approved `credit_limit`
policy at the Sale's `transactionTime`. It locks the customer and calculates the
current balance from canonical account entries, using integer minor units. A
`hard_block` policy with a same-currency limit refuses a Sale when
`currentBalance + saleTotal > limit`; equality is allowed. An
`information_only` policy allows the command and records the selected policy
version. `warning` and `approval_required` remain unavailable until a complete
visible workflow exists, so they refuse before any Sale, ledger or cash effect.

No approved policy means the optional control is inactive, not a hidden global
limit. An invalid definition, mixed currency, missing hard-block limit, or
unsupported mode fails closed. An allowed posted Sale stores
`creditLimitPolicyVersionId` so the decision's policy lineage survives later
policy changes and backup/restore.

The same customer lock is taken by Sale posting, payment recording/reversal,
manual debt adjustment and Sale voiding. This prevents credit evaluation and
ledger mutation from observing competing customer effects out of order.

## Evidence

- `packages/domain-kernel/src/debt/credit-limit.ts`
- `apps/api/src/modules/sale/post-sale.handler.ts`
- `packages/db/src/schema/sale.ts`
- `packages/db/migrations/0049_cute_wendell_rand.sql`
- `apps/web/src/ui/copy.ts`

## Tests

TC-CREDIT-001, TC-CREDIT-002, TC-CREDIT-003, TC-CREDIT-004
