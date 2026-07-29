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
  Product and unit must exactly match the immutable Purchase line.
- **BR-INVENTORY-002** — Net received quantity per Purchase line cannot exceed
  purchased quantity. Multiple partial Receipts are allowed.
- **BR-INVENTORY-003** — Each Receipt line creates exactly one positive
  inventory movement. Retry cannot append a second movement.
- **BR-INVENTORY-004** — Receipt reversal is append-only and creates one inverse
  movement referencing each original movement.
- **BR-INVENTORY-005** — Inventory truth is the movement ledger. The disposable
  projection is keyed by workspace, Product and unit; incompatible units are
  never summed or converted.
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
  changing the canonical per-Product/unit movement model.

## Backup and operations

WorkspaceBackupV3 includes Supplier, Purchase, Receipt, movement, Delivery,
return, document, and document-share canonical rows but no derived projections.
Restore accepts V1/V2, restores V3 transactionally into an empty target, rebuilds
projections, then requires customer, supplier, and inventory reconciliation to
be healthy.
