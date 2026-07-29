# Depot operations rules

These rules govern M19–M21. Automated evidence establishes technical behavior,
not real-worker adoption.

## Delivery

- **BR-DELIVERY-001** — Delivery is a separate physical aggregate referencing
  immutable lines of one posted Sale. Multiple partial Deliveries are allowed.
- **BR-DELIVERY-002** — Product and unit must exactly match the Sale snapshot.
  A Sale line without Product identity cannot create an outbound movement.
- **BR-DELIVERY-003** — Dispatch creates exactly one negative inventory
  movement per line and cannot exceed the Sale line's remaining quantity.
  Return appends one positive movement referencing the original dispatch.
- **BR-DELIVERY-004** — Delivery completion has no inventory effect, and no
  Delivery operation changes customer debt.
- **BR-DELIVERY-005** — Dispatch/return retries are duplicate-safe and
  concurrency is serialized against the Sale/Delivery canonical state.
- **BR-DELIVERY-006** — Sale void/replacement never silently reverses physical
  goods. A replacement is not fulfillable when its predecessor already has
  active net fulfilment without an explicit allocation model.

## Documents

- **BR-DOCUMENT-001** — A document is an immutable, versioned snapshot of a
  canonical source; regeneration never mutates source or prior versions.
- **BR-DOCUMENT-002** — Snapshot totals are server-derived and its SHA-256
  digest is deterministic over the canonical representation.
- **BR-DOCUMENT-003** — Sharing uses a random token while storage retains only
  its hash. Expired, revoked, unknown, or digest-invalid shares fail closed.
- **BR-DOCUMENT-004** — Documents are print-ready business snapshots only. They
  make no tax-invoice, e-signature, or accounting-compliance claim.

## Reports

- **BR-REPORT-001** — Reports are derived reads over canonical ledgers and
  movements. They never become a second source of truth.
- **BR-REPORT-002** — Business-date grouping uses `transactionTime` in
  `Asia/Ho_Chi_Minh`; recorded time does not move a transaction to another day.
- **BR-REPORT-003** — Units are never converted or combined. Report totals
  reconcile to canonical sums and each row links to its source transaction.
- **BR-REPORT-004** — Pagination uses a deterministic total order and a cursor,
  and reads expose healthy or integrity-attention state rather than hiding
  source/projection corruption.
