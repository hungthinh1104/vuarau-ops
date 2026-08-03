# Supply Commitment cases

## CASE-SUPPLY-COMMITMENT-001 — Unpriced supply promise

A supplier promises 12.5 kg of Cà chua for a future arrival. The draft stores
the quantity and expected time with `totalAmount = null`; no payable or inventory
effect exists.

## CASE-SUPPLY-COMMITMENT-002 — Confirmed exact commitment

The operator adds the canonical Product and confirms 12.5 kg at 12,000 VND per
kg. The stored total is exactly 150,000 VND, with terms and source references
preserved. Only the commercial lifecycle changes.

## CASE-SUPPLY-COMMITMENT-003 — Retry, cancellation and workspace boundary

The same command key returns the original result. A cancellation increments the
version and stores its reason. A caller in another workspace cannot read or
mutate the commitment by supplying its ID.

## Recovery

Backup V17 contains `supplyCommitments` and `supplyCommitmentLines`. Restore
requires the referenced Supplier, Product and optional QualityGrade to be in the
same source workspace.
