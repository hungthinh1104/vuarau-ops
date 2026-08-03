# Depot operations rules

These rules govern M19–M21. Automated evidence establishes technical behavior,
not real-worker adoption.

## Delivery

- **BR-DELIVERY-001** — Delivery is a separate physical aggregate referencing
  immutable lines of one posted Sale. Multiple partial Deliveries are allowed.
- **BR-DELIVERY-002** — Product, QualityGrade and unit must exactly match the
  Sale snapshot. A legacy line without Product or grade identity cannot create
  an outbound movement and is surfaced as integrity attention.
- **BR-DELIVERY-003** — Dispatch creates exactly one negative inventory
  movement per line and cannot exceed the Sale line's remaining quantity.
  Return appends one positive movement referencing the original dispatch.
- **BR-DELIVERY-004** — Delivery completion has no inventory effect, and no
  Delivery operation changes customer debt.
- **BR-DELIVERY-005** — Dispatch/return retries are duplicate-safe and
  concurrency is serialized against the Sale/Delivery canonical state.
- **BR-DELIVERY-006** — Sale void/replacement never silently reverses physical
  goods. A replacement is not fulfillable when any predecessor in its correction
  chain already has active net fulfilment without an explicit allocation model. Once a Sale is
  voided, new Delivery creation, editing, and dispatch are rejected; an existing
  dispatched Delivery remains historical truth and may receive an explicit
  return.
- **BR-DELIVERY-007** — Fulfilment derives ordered, dispatched, returned,
  net fulfilled and remaining quantities using
  `remaining = ordered - dispatched + returned`. Invalid negative/over-fulfilled
  histories are not clamped; they return `attention`.

## Documents

- **BR-DOCUMENT-001** — A document is an immutable, versioned snapshot of a
  canonical source; regeneration never mutates source or prior versions.
  PostgreSQL structurally rejects update and delete of stored snapshots.
- **BR-DOCUMENT-002** — Snapshot totals are server-derived and its SHA-256
  digest is deterministic over the canonical representation. Authenticated
  reads verify that digest, and logical restore rejects a mismatched document
  without committing any canonical row.
- **BR-DOCUMENT-003** — Sharing uses a random token while storage retains only
  its hash. Every new share has a finite expiry; an omitted expiry defaults to 24
  hours on the server. Expired, revoked, unknown, or digest-invalid shares fail
  closed.
- **BR-DOCUMENT-004** — Documents are print-ready business snapshots only. They
  make no tax-invoice, e-signature, or accounting-compliance claim.
- **BR-DOCUMENT-005** — A multi-day customer statement is a presentation snapshot
  over immutable account entries, never a multi-day Sale. Its optional inclusive
  period is interpreted in `Asia/Ho_Chi_Minh`; opening balance, signed period change,
  closing balance and classification are server-derived. Generating or printing it
  creates no money/goods fact and performs no Payment-to-Sale allocation.

## Reports

- **BR-REPORT-001** — Reports are derived reads over canonical ledgers and
  movements. They never become a second source of truth.
  `customer_account_activity` reads customer ledger activity only; receiving,
  inventory, and Delivery events are represented by separate report types.
- **BR-REPORT-002** — Business-date grouping uses `transactionTime` in
  `Asia/Ho_Chi_Minh`; recorded time does not move a transaction to another day.
- **BR-REPORT-003** — Units are never converted or combined. Report totals
  reconcile to canonical sums and each row links to its source transaction.
- **BR-REPORT-004** — Pagination uses a deterministic total order and a cursor,
  and reads expose healthy or integrity-attention state rather than hiding
  source/projection corruption. A projection-backed report returns no numeric
  rows or totals while workspace integrity is in attention; its CSV is header-only
  until the projection is reconciled or rebuilt. Canonical activity/movement
  reports may remain visible with the attention state because they read source
  facts directly.
- **BR-REPORT-005** — Policy-blocked management metrics are published as
  `unavailable` candidates with their decision gates and no numeric fallback.
  Missing policy, missing canonical sources or unresolved metric semantics must
  not be rendered as zero, estimated truth or a recommendation. A future metric
  becomes available only after its formula, canonical sources, time semantics,
  integrity behavior, drill-down and action are defined and verified.
- **BR-REPORT-006** — `report.intelligence` is a policy-backed, read-only
  operational snapshot. It may copy totals only from the report types selected
  by an effective approved `management_intelligence` policy and must preserve
  policy lineage and source report types. Missing policy, missing source or source
  integrity attention fails closed with no indicators. This contract does not
  define COGS, profit, forecast, score, recommendation or a new financial/goods
  effect.

## Source-linked cost observations

- **BR-EVIDENCE-001** — A CostObservation preserves exact observed wording, money,
  quantity and source references as an append-only workspace fact. Missing values
  stay `null`; they are not interpreted as zero.
- **BR-EVIDENCE-002** — Recording a CostObservation creates no COGS, profit,
  payable, receivable or inventory effect. Those meanings require explicit
  workspace policy and a separate canonical command.
- **BR-EVIDENCE-003** — A correction is a new immutable CostObservation linked to an
  existing observation in the same workspace. Identity, authorization,
  idempotency, transaction time and recorded time use the common command contract.

## Operational reconciliation observations

- **BR-EVIDENCE-004** — A ReconciliationObservation preserves separate expected and
  observed money/quantity facts, optional item count, scope reference, wording and
  source references. Missing values remain `null`; they are not zero-filled or
  inferred from another source.
- **BR-EVIDENCE-005** — Recording a ReconciliationObservation does not calculate a
  variance, approve a close, match a statement, change cash/debt/payable or append
  an inventory movement. Those effects require explicit workspace policy and a
  separate canonical command.
- **BR-EVIDENCE-006** — A correction is a new immutable ReconciliationObservation
  linked to an existing observation in the same workspace. Identity,
  authorization, idempotency, transaction time and recorded time use the common
  command contract.

## Debt-term observations

- **BR-EVIDENCE-007** — A DebtObservation preserves source-linked wording,
  payment-term text/code, agreed due date, promise-to-pay date, payment
  reference, optional amount and optional allocation proposal as an append-only
  workspace fact. Missing values remain `null`.
- **BR-EVIDENCE-008** — Recording a DebtObservation never derives `overdue`,
  allocates a Payment, changes CustomerAccountEntry, or changes Cashbook truth.
  Those meanings require an explicit accepted workspace policy and canonical
  command.
- **BR-EVIDENCE-009** — A correction is a new immutable DebtObservation linked
  to an existing observation in the same workspace. Identity, authorization,
  idempotency, transaction time and recorded time use the common command
  contract.

## Supply commitment observations

- **BR-EVIDENCE-010** — A SupplyCommitmentObservation preserves exact
  source-linked wording, optional known supplier/product/grade identity,
  promised and minimum quantities, expected arrival, counterparty label and
  commitment reference. Missing fields remain `null`; they are not inferred.
- **BR-EVIDENCE-011** — Recording a SupplyCommitmentObservation never creates a
  Purchase, SupplierAccountEntry, PurchaseReceipt, InventoryMovement, reorder
  state, supplier score or recommendation. Those meanings require field
  evidence, an accepted workspace policy and a separate canonical command.
- **BR-EVIDENCE-012** — A correction is a new immutable
  SupplyCommitmentObservation linked to an existing observation in the same
  workspace. Identity, authorization, idempotency, transaction time and
  recorded time use the common command contract.

## Supplier relationship and performance observations

- **BR-EVIDENCE-013** — A SupplierObservation preserves source-linked wording,
  optional known supplier/product/grade identity, relationship and responsibility
  wording, source area, lead-time wording, traceability, quantities, timing and
  price/claim references. Missing fields remain `null`; they are not inferred.
- **BR-EVIDENCE-014** — Recording a SupplierObservation never creates a Supplier
  score, ranking, payable, inventory movement, claim settlement or purchase
  recommendation. Those meanings require field evidence, an accepted workspace
  policy and a separate canonical command.
- **BR-EVIDENCE-015** — A correction is a new immutable SupplierObservation
  linked to an existing observation in the same workspace. Identity,
  authorization, idempotency, transaction time and recorded time use the common
  command contract.

## Customer demand observations

- **BR-EVIDENCE-016** — A DemandObservation preserves source-linked customer,
  product, grade, requested/minimum quantity, requested time, counterparty and
  demand-reference facts. Missing fields remain `null`; they are not inferred.
- **BR-EVIDENCE-017** — Recording a DemandObservation never creates a Sale,
  receivable, inventory movement, shortage state, forecast or reorder
  recommendation. Those meanings require canonical facts, an accepted workspace
  policy and a separate command.
- **BR-EVIDENCE-018** — A correction is a new immutable DemandObservation linked
  to an existing observation in the same workspace. Identity, authorization,
  idempotency, transaction time and recorded time use the common command
  contract.
