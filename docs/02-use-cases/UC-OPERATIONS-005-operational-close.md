# UC-OPERATIONS-005 — Sign off an operational business day

## Intent

An authorized owner or accountant records that the configured reconciliation
observations for one business date were reviewed. The result is a source-linked
close fact, not a recalculation of any ledger.

## Contract

- Actor: owner or accountant.
- Permission: `operations.close`.
- Preconditions: an approved effective `operating_cycle_reconciliation` policy;
  every required observation belongs to the workspace and is measurable.
- Input: close ID, business date, observation IDs, evidence references and reason.
- State: an immutable `closed` row per revision, optionally followed by one
  append-only `reopened` fact; after reopen, one explicitly linked close revision
  may supersede it.
- Idempotency: identical command identity returns the original committed result;
  the latest closed revision prevents another close, while a reopened revision
  requires its explicit supersedes link.
- Concurrency: reopen requires the current `expectedVersion`.
- Effects: no customer/supplier ledger, CashMovement or InventoryMovement is
  created by the close itself.
- Audit: record and reopen actions include actor, command, policy lineage and
  evidence references.

## Fail-closed paths

Missing or malformed policy, missing observation, duplicate kind, foreign workspace,
duplicate business date, disallowed reopen and stale version are rejected before a
canonical close transition is written.

## UI states

Operations shows only server-returned close state, period, observation count,
policy version and reopen state. Loading/error is explicit; the UI never infers a
close from a healthy projection.
