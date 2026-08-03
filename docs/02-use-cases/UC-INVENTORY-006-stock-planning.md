# UC-INVENTORY-006 — Read policy-backed stock planning

## Intent

An authorized workspace member can inspect reorder suggestions for the current
inventory at a stated `asOf` time. The result is derived from canonical
inventory movements and the approved effective workspace planning policy.

## Contract

- `inventory.planning` is workspace-scoped and requires `inventory.read`.
- The query uses only an approved effective `stock_planning_reorder` policy.
- The supported strategy is `fixed_threshold`: each policy rule names a
  Product, optional QualityGrade, unit, minimum and target quantity.
- The result is `unavailable` with diagnostics when the policy is absent,
  invalid or cannot produce exact bounded quantities.
- Demand observations remain source facts. This slice does not infer velocity,
  lead time, forecast, supplier recommendation or financial effect.

## Evidence

The calculation has domain and application coverage. PostgreSQL parity is
provided by the canonical inventory read adapter; the product inventory screen
renders the unavailable state instead of inventing a recommendation.
