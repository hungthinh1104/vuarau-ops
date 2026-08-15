# ADR-0031 — Share bounded semantic facts through fresh PostgreSQL views

## Status

Accepted and implemented for Payment exposure · 2026-08-15

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
canonical Payment, allocation, reversal and debt-observation tables. Its
arithmetic owner is `derivePaymentExposure` in the domain kernel. Board page
variants and Board counts consume the view; they retain only query-specific
activity, search, ordering and pagination logic. The in-memory Board uses the
same kernel arithmetic.

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

**Good:** one executable owner for Payment exposure; fresh Board pages and
counts; correction-chain semantics are tested against PostgreSQL; query
optimization remains local to each read model.

**Cost:** a view migration is part of the schema contract, and a view change
must preserve kernel/database parity. PostgreSQL still has to aggregate active
allocation and observation rows for each read.

**Not solved:** Receiving, fulfilment, Close context/gate and Next Action remain
separate follow-up slices. No generic rules engine or materialized read model
is introduced by this decision.

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
- View: `packages/db/migrations/0082_payment_exposure_view.sql`.
