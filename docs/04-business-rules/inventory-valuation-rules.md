# Inventory valuation rules

These rules define the narrow read-only inventory valuation capability. They do
not activate a universal cost, profit or commercial-return policy for every
workspace.

- **BR-VALUATION-001** — Inventory valuation is workspace-scoped and selects
  only the highest approved `inventory_valuation` policy effective at `asOf`.
  Missing or unavailable policy fails closed; no global strategy or zero value
  is inferred.
- **BR-VALUATION-002** — Valuation uses the canonical Product, QualityGrade,
  unit and append-only inventory movement facts. Receipt unit cost is resolved
  from its immutable Purchase-line price. FIFO and moving weighted average use
  integer quantity and minor-unit arithmetic with deterministic ordering by
  `transactionTime → recordedAt → movementId`. Moving weighted average keeps
  an exact quantity/value cost pool; it does not recalculate rounded layer unit
  costs. Therefore `previous value + inbound value = outflow cost + remaining
value` remains true for repeated outflows. Net `cogs` includes dispatch cost
  less cost restored by a customer return; non-dispatch outflows are reported
  separately as `classifiedLossCost` and are included in the value conservation
  calculation.
- **BR-VALUATION-003** — A monetary result is unavailable when cost lineage is
  missing, currencies conflict, inventory becomes negative, or a
  `specific_actual_cost` is not approvable until an exact lot-attribution adapter
  exists. The system must not substitute zero, stale projection data, inferred
  landed cost or a guessed COGS/profit effect. A compensating movement must identify an existing
  opposite-direction movement through `reversalOfMovementId`: receipt
  reversals remove the original receipt layer, while delivery returns restore
  the original dispatch cost allocation. Missing, inconsistent or already
  exhausted lineage fails closed with a diagnostic. `no_valuation` may expose
  quantity while keeping money explicitly null.

The capability reports inventory value and calculation diagnostics only. Debt,
Supplier payable, claims, returns, profit and management recommendations require
separate policy-backed slices and evidence.
