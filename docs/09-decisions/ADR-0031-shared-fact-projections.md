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

The Board and Product Coverage consume these facts rather than re-deriving
receipt, return or fulfilment formulas in separate CTEs. The view remains a
fresh read-only projection: a detected integrity error is surfaced, never
silently repaired or converted into a write authorization.

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
- Tests: `operational-facts.test.ts` and TC-GOODS-RECEIPT-REVERSAL-001 in
  `purchase-correction.db.test.ts`.
- View migrations: `packages/db/migrations/0082_payment_exposure_view.sql` and
  `packages/db/migrations/0084_first_red_skull.sql` and
  `packages/db/migrations/0085_operational_facts_views.sql`.
