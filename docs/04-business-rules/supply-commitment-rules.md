# Supply Commitment rules

These rules define the commercial fact between a workspace and a Supplier before
the physical Purchase/Arrival flow. A Supply Commitment is not a Purchase.

- **BR-SUPPLY-COMMITMENT-001** — Every command is workspace-scoped and the
  Supplier and referenced Product are resolved inside that workspace. A missing
  or inactive Supplier/Product fails before mutation.
- **BR-SUPPLY-COMMITMENT-002** — Draft lines preserve exact quantity, unit,
  optional QualityGrade, optional agreed unit price and payment-term/arrival
  snapshots. No float or live catalog lookup may rewrite a stored snapshot.
- **BR-SUPPLY-COMMITMENT-003** — Confirmation requires at least one line and a
  canonical Product on every line. It increments `version` and makes the
  commercial fact immutable.
- **BR-SUPPLY-COMMITMENT-004** — Edits and lifecycle transitions require the
  expected version. Cancellation records a reason; a replacement references one
  cancelled commitment and never rewrites it.
- **BR-SUPPLY-COMMITMENT-005** — Creating, confirming or cancelling a Supply
  Commitment creates no Purchase, supplier payable, Receipt, inventory movement
  or customer account entry. Those are explicit later commands.
- **BR-SUPPLY-COMMITMENT-006** — Authorization, idempotency and persistence are
  applied before/inside the same command transaction. A retry returns the stored
  result and cannot append a second commercial fact or audit record.
- **BR-SUPPLY-COMMITMENT-007** — Export/restore carries the commitment and line
  tables in Backup V17; restore validates Supplier/Product/Grade references.

## Related

- [Supply Commitment state machine](../03-state-machines/supply-commitment-state-machine.md)
- [Supply Commitment use cases](../02-use-cases/supply-commitment-use-cases.md)
- [Supply Commitment cases](../05-casebook/supply-commitment-cases.md)
- [trace map](../08-qa/trace-map.yml)
