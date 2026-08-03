# UC-INVENTORY-007 — Count and approve a stocktake session

## Intent

An authorized warehouse member can open a physical stocktake session, record
counts by Product/QualityGrade/unit, approve exact variances and reopen only
when the effective stocktake policy permits it.

## Contract

- Start, count, approve and reopen are commands requiring `inventory.adjust`;
  reads require `inventory.read`.
- A session records its `asOf`, scope, actor, evidence and approved policy
  version. Counts are append-only; a correction references the superseded count.
- Approval derives expected quantity from canonical movements at `asOf` and
  appends signed `stocktake_variance` movements in the same unit and grade.
- Reopen appends exact compensation movements with `reversalOfMovementId`; it
  never edits or deletes the original variance.
- Version checks, idempotency and workspace scoping apply at every command.
  Missing movement lineage fails closed and writes no compensation.

## Evidence

The in-memory application tests cover policy refusal, exact variance and
reopen compensation. The PostgreSQL test covers policy lineage, persistence
and the canonical read. Logical backup/restore tests preserve sessions and
counts. The inventory screen exposes a small typed start/count/approve flow.
