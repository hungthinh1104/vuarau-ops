# Configurable fresh-produce operating model

This document is the domain boundary for the next product phase. It records the
architecture decision from the broader field sample; it does not claim that every
stage below is already implemented.

## Product baseline

`vuarau-ops` is a configurable fresh-produce depot and distribution operating
system for production regions, wholesale markets, regional hubs and contract
chains. It records traceable operational facts and applies a workspace's
configured, or explicitly confirmed, policy when a fact is allowed to affect
inventory, debt, cost or management reporting.

It must not assume one national depot pattern, a universal operating hour, a
single customer channel, or that arrival, acceptance, packing, loading, delivery
and financial recognition are the same event.

## Universal operating chain

The common vocabulary is a chain of facts, not one command or one aggregate:

```text
Demand / Customer Order
  → Procurement / Supply Commitment
  → Collection / Arrival
  → Weighing / Inspection
  → Acceptance / Rejection / Quarantine
  → Grading / Packing
  → Allocation
  → Loading / Dispatch
  → Delivery / Handover
  → Receivable / Payable / Payment
  → Return / Claim / Reconciliation
```

The current repository already implements several of these as separate facts:
Purchase, GoodsArrival, QualityInspection, QualityDisposition, inventory
movements, Delivery/Return and account/cash ledgers. The remaining vocabulary is
not a reason to overload Receiving or to create fake transitions for stages a
workspace does not use.

## Three truth dimensions

| Dimension  | Examples                                                                                     | Rule                                                                  |
| ---------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Commercial | customer order, Sale, Purchase, agreed price                                                 | describes an agreement; does not imply custody or acceptance          |
| Physical   | arrival, weight, inspection, disposition, pack, allocation, load, dispatch, delivery, return | describes goods and custody; does not silently change debt or payable |
| Financial  | customer ledger, supplier ledger, cashbook, payment, claim, credit                           | changes only through an explicit policy-backed command                |

Reports and projections derive from these canonical facts. A state label such as
`promised`, `arrived`, `accepted`, `packed`, `allocated`, `loaded` or `delivered`
must remain distinguishable in the source model and in read models.

## Product identity

Where a workflow needs it, physical identity is the combination of:

`Product + Quality/Grade + Unit + Source + Packing specification`

Source and packing are optional for a simple workspace, but they must not be
discarded when a workspace uses them. A Product is not a lot, a Grade is not a
condition inspection, and a packing specification is not a unit conversion.

## Workspace policy layer

The fact layer is universal; the meaning of a cross-dimension effect is selected
by workspace policy. Policy may cover:

- operating-day boundary, optional sessions, packing/shipment batches and
  reconciliation close;
- customer channel and its grade, packing, traceability, delivery and payment
  requirements;
- source/packing requirements and transport ownership, responsibility and cost;
- debt/payable recognition, payment terms, price precedence and approval;
- inventory valuation, stock planning, adjustment and close semantics.

No policy is global merely because it is common in one sampled depot. A new
policy must be represented by an explicit contract, a transition/correction
path, workspace isolation, PostgreSQL parity, backup/restore evidence and a
traceable test before it can affect a canonical balance or movement.

## Evidence before intelligence

Raw evidence may be captured without claiming a derived management result. The
first additive `CostObservation` slice records source-linked cost/loss facts
without creating a canonical effect. The second additive
`ReconciliationObservation` slice records separate expected/observed facts
without calculating a variance or closing a period. Further evidence slices may
record debt-term evidence, supply/arrival quantities, generic stocktake counts,
bank-statement matches and supplier relationship or delivery observations. The
supplier observation slice preserves roles, responsibilities, timing,
quantities, quality-related wording and price evidence without inferring a score.

Those records must not be presented as COGS, profit, overdue aging, reorder risk,
supplier score or AI advice until the relevant field policy is decided. ASM-039
through ASM-048 remain policy gates for those derived outcomes; “capture evidence”
is not the same as “close the policy”.

## Implementation boundary

For each new fact, use the smallest domain-specific slice and prove:

1. a typed command and read model with a required `workspaceId`;
2. authorization before mutation, idempotency and deterministic transaction time;
3. append-only history or an explicit compensation/supersession path;
4. in-memory and Drizzle behavior parity, including a PostgreSQL regression;
5. backup/restore and rebuild behavior before exposing a management surface.

Do not add a generic rule builder, a manually maintained module index, or a
dashboard that guesses missing policy.

## Related authority

- [ADR-0027](../09-decisions/ADR-0027-configurable-fresh-produce-operating-model.md)
- [context map](context-map.md)
- [product invariants](../00-product/product-invariants.md)
- [decision backlog](../09-decisions/decision-backlog.md)
- [use-case completeness audit](../02-use-cases/use-case-completeness-audit.md)
