# Goods Truth rules

These rules establish M16–M18 and are extended by
[depot-operations-rules.md](depot-operations-rules.md) for M19–M21. They do not
claim that a depot has validated the workflow in live operations.

## Supplier and payable

- **BR-SUPPLIER-001** — Supplier identity is workspace-scoped, versioned and
  deactivated rather than deleted.
- **BR-SUPPLIER-002** — The supplier ledger is append-only. Positive means the
  depot owes the supplier; negative is valid supplier credit.
- **BR-SUPPLIER-003** — Supplier payment input is positive and creates one
  negative ledger effect. A reversal creates one positive effect referencing the
  original effect.
- **BR-SUPPLIER-004** — Supplier adjustment is only for events without a
  Purchase. It requires a positive input, explicit direction, reason code and
  nonblank explanation.
- **BR-SUPPLIER-005** — Supplier balance is a rebuildable projection. Rebuild
  refuses source corruption and never changes the ledger.
- **BR-SUPPLIER-006** — Supplier price history is a read-only view of immutable
  `confirmed` Purchase-line snapshots. It preserves Product identity, quantity,
  unit price and both business/recording timestamps; draft or discarded Purchases
  are excluded. It does not infer a normalized supplier price, recommendation or
  performance score.

## Purchase

- **BR-PURCHASE-001** — Purchase is `draft → confirmed` or
  `draft → discarded`. Confirmed snapshots are immutable.
- **BR-PURCHASE-002** — Purchase line arithmetic reuses the canonical exact
  Sale line-total calculation.
- **BR-PURCHASE-003** — Confirming an active Supplier's stored draft creates
  exactly one positive supplier payable in the same transaction. It creates no
  inventory movement.
- **BR-PURCHASE-004** — A Purchase void is appended beside the confirmed
  Purchase and creates exactly one negative payable compensation.
- **BR-PURCHASE-005** — A replacement may reference one confirmed, voided
  Purchase that has no existing replacement.
- **BR-PURCHASE-006** — A Purchase with net active Receipts cannot be voided.

## Receiving and inventory

- **BR-INVENTORY-001** — A Receipt references an active confirmed Purchase.
  Product and unit must exactly match the immutable Purchase line. Under ADR-0024, the workspace profile either requires each new quantity to name an active workspace QualityGrade or requires the explicit ungraded bucket. A default grade is never invented.
- **BR-INVENTORY-002** — Net received quantity per Purchase line cannot exceed
  purchased quantity across all grades. Multiple partial and split-grade
  Receipts are allowed.
- **BR-INVENTORY-003** — Each Receipt line creates exactly one positive
  inventory movement. Retry cannot append a second movement.
- **BR-INVENTORY-004** — Receipt reversal is append-only and creates one inverse
  movement referencing each original movement.
- **BR-INVENTORY-005** — Inventory truth is the movement ledger. The disposable
  projection is keyed by workspace, Product, QualityGrade and unit; grades and
  incompatible units are never silently merged or converted.
- **BR-INVENTORY-006** — Negative inventory is retained and classified as an
  anomaly, never clamped to zero.
- **BR-INVENTORY-007** — Inventory adjustment requires explicit direction,
  positive quantity, reason code and nonblank explanation. It must not hide a
  wrong Receipt.
- **BR-INVENTORY-008** — All Goods Truth timelines use
  `transactionTime → recordedAt → id`, and cursor predicates use the same total
  order.
- **BR-INVENTORY-009** — M18 established inbound and explicit adjustment
  events. M19 adds outbound dispatch and explicit return sources without
  changing the canonical movement model.
- **BR-INVENTORY-010** — QualityGrade is configurable workspace master data.
  It is commercial classification of a physical quantity, not an attribute that
  splits Product identity. Grade names are snapshotted on physical documents.
  `QualityGrade` means commercial grade only; it is not Condition, Defect,
  inspection approval, quarantine or supplier-claim state (ASM-033).
- **BR-INVENTORY-011** — Reclassification appends one negative source-grade and
  one equal positive destination-grade movement atomically. Reason and actor
  are required, total quantity is conserved, and customer/supplier money is
  unchanged.
- **BR-INVENTORY-012** — Spoilage/loss is an attributable negative inventory
  adjustment with an explicit reason; it is not a Sale, Receipt or Delivery.

## Backup and operations

WorkspaceBackupV4 adds QualityGrade and grade snapshots to the V3 canonical
boundary but no derived projections. Restore continues to accept V1–V3; missing
historical grades remain explicitly unclassified and are never assigned an
arbitrary grade. V4 restore is transactional and rebuilds grade-aware
projections before customer, supplier and inventory reconciliation.
