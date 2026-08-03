# ADR-0026: Separate physical arrival, inspection and quality disposition

- Status: accepted
- Date: 2026-08-02

## Context

A traditional depot may receive goods before quantity, condition and commercial grade are settled. Treating receipt as immediate stock hides weighing evidence, rejected goods, quarantine and responsibility. Other depots use a simpler direct-receipt process, so one mandatory flow would be inaccurate.

## Decision

Introduce an optional inspected-intake workflow with three append-only fact families:

1. `GoodsArrival` records custody, supplier/Purchase linkage, quantities and optional gross/tare/net evidence.
2. `QualityInspection` records inspected coverage, issue snapshots and evidence references.
3. `QualityDisposition` allocates eligible quantity to accepted, quarantined, rejected or disposed outcomes.

Only accepted allocations create sellable inventory. Corrections use explicit reversals in dependency order. Workspace profile selects `direct_receipt` or `inspected_arrival`, plus `quantity_only` or `gross_tare_net` weighing.

## Alternatives considered

- Treat Purchase receipt as immediate inventory: rejected because physical arrival may still be uninspected, quarantined or rejected.
- Store one mutable received quantity/status: rejected because it erases weighing and correction evidence.
- Force inspected intake on every depot: rejected because some depots legitimately use direct receipt.
- Change supplier payable from quality outcome automatically: rejected until claim, credit and billable-quantity policy is explicit.

## Consequences

Physical truth no longer implies inventory truth. Quarantine remains visible without becoming sellable stock. Purchase void is blocked once active goods arrival exists. Backup V15 and reconciliation include the new lineage.

Supplier payable still originates from Purchase confirmation. Claims, credits and billable-quantity settlement are intentionally deferred to a separate bounded context. “Bông hàng” is not defined by this decision.

## Revisit when

Revisit when supplier claims/credits define billable quantity, when multi-stage quarantine needs more than one resolution level, or when lot/expiry identity becomes canonical. “Bông hàng” must be defined independently before it can alter this model.
