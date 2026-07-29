# Goods Truth use cases

## UC-SUPPLIER-001 — Manage supplier payable

Owner/accountant create and maintain a Supplier, record or reverse payments,
record explicit opening/settlement adjustments, inspect the source-linked
timeline, reconcile it, and rebuild only a drifting projection. Warehouse may
identify Suppliers but cannot move supplier money.

All writes use client-supplied identities and the command pipeline. Unknown
outcomes are resent with the identical command. Overpayment is accepted and
produces supplier credit.

## UC-PURCHASE-001 — Record and correct a Purchase

Owner/accountant/warehouse may draft a Purchase. Only owner/accountant confirm or
void because those operations move supplier payable. Confirm reads and
recomputes the stored draft, freezes the Product snapshots and creates one
payable. A wrong confirmed Purchase is voided and optionally replaced; a manual
supplier adjustment is not a correction path.

## UC-RECEIVING-001 — Receive and correct physical goods

Owner/warehouse record one or more partial Receipts against confirmed Purchase
lines. A Receipt creates immutable per-line movements. A wrong Receipt is fully
reversed, leaving both records visible. Over-receiving, unit mismatch,
cross-workspace references and duplicate effects are refused.

## UC-INVENTORY-001 — Explain and reconcile quantity

Authorized users inspect balances independently by Product and unit, then drill
from each movement to its Receipt or adjustment document. Owner/warehouse may
record explained physical adjustments. Owner may rebuild a projection only when
canonical sources are healthy.

No use case in M16–M18 allocates supplier payments to Purchases, values stock,
computes COGS, converts units, or infers outbound movement from a Sale.
