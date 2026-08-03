# Customer Order use cases

## UC-CUSTOMER-ORDER-001 — Create and edit a Customer Order draft

**Actor and permission.** Sales, accountant or owner with
`customer_order.create`/`customer_order.update` in the selected workspace.

**Inputs.** Channel, optional real Customer, currency, zero or more requested
Product lines, optional agreed prices, payment-term snapshot, note and evidence.

**Result.** A versioned draft. Empty, unresolved and unpriced drafts are allowed
while typing. No debt, cash, inventory or fulfilment effect is written.

**Failure paths.** Channel/customer mismatch, malformed line, currency mismatch,
workspace reference mismatch, authorization failure, duplicate idempotency key or
stale version. The shared command pipeline handles authorization before mutation,
idempotency and transaction rollback.

**UI states.** Loading, empty draft, unresolved product, unpriced draft, saved,
offline/pending and conflict/reload.

## UC-CUSTOMER-ORDER-002 — Confirm a Customer Order

Confirmation requires a non-empty line set, canonical Products, positive integer
quantities and agreed prices. It snapshots the total and optional payment terms,
sets `confirmedAt`, and writes one audit action. It does not post a Sale or create
any financial/physical effect.

## UC-CUSTOMER-ORDER-003 — Cancel or supersede a Customer Order

Cancellation requires a reason and `expectedVersion`. A replacement may then be
created only against that cancelled order, with one successor maximum. Historical
orders remain readable. Cancellation is not Sale voiding and does not produce a
compensating ledger entry.

## UC-CUSTOMER-ORDER-004 — View and list Customer Orders

Reads are workspace-scoped, deterministic keyset-paged and permission-gated by
`customer_order.read`. A read exposes status, channel, snapshots, version,
capabilities and integrity-relevant timestamps.

## Related

- [Customer Order rules](../04-business-rules/customer-order-rules.md)
- [Customer Order state machine](../03-state-machines/customer-order-state-machine.md)
- [Customer Order cases](../05-casebook/customer-order-cases.md)
