# UC-INVENTORY-005 — Read policy-backed inventory valuation

## Intent

An authorized workspace member can inspect the value of a Product's physical
inventory at a stated `asOf` time. The result is derived from the canonical
inventory movement ledger and the approved workspace valuation policy that was
effective at that time.

## Contract

- `inventory.valuation` is workspace-scoped and requires `inventory.read`.
- The query selects the highest approved `inventory_valuation` policy whose
  effective range contains `asOf`. A draft, future, expired or retired version
  is not used.
- Supported strategies are `fifo`, `moving_weighted_average`,
  `specific_actual_cost` and `no_valuation`. The calculation uses integer
  quantities and integer minor-unit money; it never uses floating-point money.
- Receipt costs come from the immutable Purchase line referenced by the
  Receipt. Inventory movements without a trustworthy cost lineage do not become
  zero-cost stock.
- Only `delivery_dispatch` contributes to the returned `cogs` amount. Inventory
  adjustments and other non-dispatch movements are reflected in stock layers,
  not classified as COGS.
- Compensating movements must point to an opposite-direction source movement
  with `reversalOfMovementId`. A purchase-receipt reversal removes the original
  receipt layer, and a delivery return restores the original dispatch
  allocation. Missing or exhausted lineage makes the result unavailable.
- The query returns `unavailable` with diagnostics when policy or cost lineage
  is missing, currencies conflict, inventory is negative, or a specific-cost
  lot reference is unavailable. The UI must not display an estimated amount.
- This slice does not derive customer debt, Supplier payable, landed cost,
  profit, margin, claims, returns or management recommendations.

## Persistence and parity

The in-memory and PostgreSQL read adapters resolve the same Receipt → Purchase
line cost lineage and preserve the same workspace, Product, grade, unit and
`asOf` scope. No migration is required: the query reuses canonical policy,
Purchase, Receipt and inventory movement facts.

## Evidence state

The calculation and read-only API boundary are implemented with domain,
application, PostgreSQL and web regression coverage. Field validation of the
chosen valuation strategy and broader COGS/profit policy remain outside this
slice.
