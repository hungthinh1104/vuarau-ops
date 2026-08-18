# ADR-0031 — Share bounded semantic facts through fresh PostgreSQL views

## Status

Accepted and implemented for Payment exposure, fulfilment and receiving · 2026-08-18

## Context

The Operations Board, its count query and the in-memory adapter were each
recomputing the meaning of an unallocated customer Payment. The copies were
similar enough to look reusable but differed in correction and reversal edge
cases. The UI and readiness result could therefore agree while a write or a
second read path used a different amount.

The repository is a modular monolith with a small number of concurrent depot
users. The main technical-debt risk is not repeated SQL text by itself; it is
multiple executable owners for one business meaning.

## Decision

Use this ownership chain for bounded operational facts:

```
canonical tables
  -> fresh PostgreSQL semantic fact view
  -> pure domain classification/arithmetic
  -> query-specific read models
```

The first fact is `payment_exposure_v1`. It derives original, reversed,
effective, actively allocated, preserved-credit and available amounts from the
canonical Payment, allocation, reversal and customer-credit-preservation tables. Its
arithmetic owner is `derivePaymentExposure` in the domain kernel. Board page
variants and Board counts consume the view; they retain only query-specific
activity, search, ordering and pagination logic. The in-memory Board uses the
same kernel arithmetic.

The same boundary now owns physical goods facts:

- `sale_line_fulfilment_facts_v1` derives ordered, dispatched, returned, net,
  active-dispatch and remaining quantities for every Sale line, including an
  undelivered line. `deriveSaleLineFulfilmentFacts` owns the exact integer
  arithmetic and persisted-integrity classification.
- `purchase_line_receiving_facts_v1` derives direct receipts, accepted quality
  dispositions, receipt reversals, received net and remaining quantities for
  every Purchase line. `derivePurchaseLineReceivingFacts` owns its arithmetic
  and over-receipt classification.

Delivery fulfilment reads, receiving commands and summaries, Reports,
Dashboard summary, Product Coverage and the Operations Board consume these
facts rather than silently creating another semantic owner. The in-memory
adapters call the same domain arithmetic and bounded aggregation helpers. The
view remains a fresh read-only projection: a detected integrity error is
surfaced, never silently repaired or converted into a write authorization.

Two deliberate performance projections remain exceptions to the “join the
view” rule: Product Coverage filters source rows by requested Product before
aggregation, and the fast Board page scopes the equivalent facts to its
candidate Sale/Purchase set. They are query-specific projections, not new
business rules; their arithmetic must stay aligned with the two canonical
views and is guarded by the Goods Truth parity/recovery tests. A new optimized
projection must document the same justification and add a parity case before
it is accepted.

Correction and settlement chains select the current lineage tip by
`related_*_id` successor absence. Recorded time and id are only deterministic
fallback ordering among malformed multiple tips; they never replace lineage
with “latest transaction wins”. A Return exception preserves the exact Return
and Delivery ids in its source facts while the Sale remains the display
aggregate.

The view is regular, not materialized. Payment exposure is an operational queue
fact and stale money uncertainty is worse than repeating a bounded calculation.
The view is read-only and is never an invariant owner, ledger, exception row or
write authorization. The close command must continue to evaluate its own gate
inside its write transaction.

Do not generalize this into a giant operational service, universal CTE or
generic financial engine. Add a fact view only when at least two read paths
need the same business meaning and a parity test can compare it with the
kernel. Keep domain-specific classification and next-action decisions separate.

## Consequences

**Good:** one executable owner for Payment, fulfilment and receiving exposure;
fresh Board pages and counts; correction-chain semantics are tested against
PostgreSQL; query optimization remains local to each read model.

**Cost:** a view migration is part of the schema contract, and a view change
must preserve kernel/database parity. PostgreSQL still has to aggregate active
allocation, customer-credit-preservation, delivery/return and quality-chain
rows for each read.

**Not solved:** Close context/gate remains a write-path concern, and field
recognition, role sign-off, provider recovery and global rate limiting remain
external gates. No generic rules engine or materialized read model is
introduced by this decision.

## Alternatives considered

| Alternative                                        | Why rejected                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Keep each Board query's CTE                        | Leaves multiple business formula owners and lets page/count parity drift.                    |
| One `OperationalStateService` or financial service | Hides bounded-context ownership behind a mega-abstraction and couples unrelated read models. |
| Materialized view                                  | Freshness and refresh failure would create a second operational state to reconcile.          |
| Move all read models into the kernel               | The kernel cannot own SQL selection, tenant joins, search or keyset pagination.              |

## Revisit when

Revisit if measured PostgreSQL plans show the regular view cannot meet the
production page budget, if a named read model needs a different temporal
meaning, or if a second canonical fact source is introduced. A materialized
projection requires freshness, rebuild, backup and recovery evidence before it
can replace the regular view.

## Scope and traceability

- Rule: BR-PAYMENT-009.
- Test: TC-OPS-027 (`payment-exposure-parity.db.test.ts`).
- Tests: `operational-facts.test.ts`, the Delivery/Report path in
  `depot-operations.db.test.ts`, and TC-GOODS-RECEIPT-REVERSAL-001 in
  `purchase-correction.db.test.ts`.
- View migrations: `packages/db/migrations/0082_payment_exposure_view.sql` and
  `packages/db/migrations/0084_first_red_skull.sql` and
  `packages/db/migrations/0085_operational_facts_views.sql` and
  `packages/db/migrations/0087_silent_goods_truth.sql`.
