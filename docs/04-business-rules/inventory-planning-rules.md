# Inventory planning and stocktake rules

These rules make planning and stocktake explicit, policy-backed operational
facts. They do not turn demand observations into forecasts or silently alter
financial ledgers.

- **BR-INVENTORY-013** — Stock planning selects the approved effective
  `stock_planning_reorder` policy and applies its exact `fixed_threshold` rules
  to canonical inventory movements at the requested `asOf`. Quantities stay in
  integer scaled units. Without a valid policy, the read is `unavailable`; no
  reorder recommendation is guessed from demand observations.
- **BR-INVENTORY-014** — A stocktake session records an immutable scope, `asOf`,
  policy version and count facts. Approval compares active counts with the
  canonical movement ledger and appends exactly one signed
  `stocktake_variance` movement per non-zero variance. Reopening is allowed only
  by the recorded policy and appends one compensation per active variance. A
  missing variance lineage fails closed before any reversal is written.

Both workflows are workspace-scoped, permission-checked and persisted through
the in-memory and PostgreSQL adapters. Backup/restore carries sessions, counts,
policy lineage and variance references; projections remain rebuildable from
canonical movements.
