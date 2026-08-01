# Cashbook use cases

## UC-CASH-001 — Manage cash accounts

Owner/accountant creates, updates, deactivates or reactivates a named money location.
The operation moves no money. Whole-object optimistic versioning and audit prevent a
stale edit from silently changing custody or account kind.

## UC-CASH-002 — Record and reverse an expense

An authorized money role records a positive expense source against one active
same-currency account. The command appends a negative CashMovement. Reversal is a
separate source fact and positive inverse movement; the original remains visible.

## UC-CASH-003 — Transfer money between accounts

An authorized money role transfers a positive amount between different active
same-currency accounts. One command appends the source fact and an equal negative/
positive movement pair. Reversal appends the exact inverse pair. Retry preserves
identity and cannot duplicate either side.

## UC-CASH-004 — Record an explained cash adjustment

Opening balance, owner contribution/draw, count correction or unidentified cash is
recorded as one explained signed source. It is used only where no better business
source exists.

## UC-CASH-005 — Inspect and reconcile cash

Readers inspect accounts, movement timeline, daily movement, active expenses and
current balances. Reconciliation validates source lineage and canonical sum against
the projection. Authorized rebuild repairs projection-only drift and refuses
canonical corruption.

## Cross-ledger Payment behavior

Customer Payment and Supplier Payment remain their existing use cases. When the
workspace enables cashbook they also require a CashAccount and create the cash
movement atomically. Debt/payable meaning remains owned by their original ledgers.
