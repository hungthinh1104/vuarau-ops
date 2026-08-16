# UC-OPERATIONS-005 — Sign off an operational business day

## Intent

An authorized owner or accountant records that the configured reconciliation
observations for one business date were reviewed. The result is a source-linked
close fact, not a recalculation of any ledger.

## Contract

- Actor: owner or accountant.
- Permission: `operations.close`.
- Preconditions: an approved effective `operating_cycle_reconciliation` policy;
  every required observation belongs to the workspace and is measurable; every
  acknowledgeable unresolved Board condition has an acknowledgement for its exact
  `(exceptionKind, source.kind, source.id)` identity before close.
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
- Audit: record, reopen and exception-acknowledgement actions include actor,
  command, policy lineage and evidence references. An acknowledgement preserves
  the unresolved Board source and changes no ledger, inventory or fulfilment fact.
  It cannot acknowledge another condition merely because the two share an
  exception kind.

Close readiness and `RecordOperationalClose` resolve the business-day period,
policy lineage and latest close revision once from the same close context. The
current scope is all open workspace Board work, not a UI page or an incidental
date filter; changing that scope requires an explicit policy-contract change.

## Fail-closed paths

Missing or malformed policy, missing observation, unacknowledged acknowledgeable
exception, duplicate kind, foreign workspace, duplicate business date, disallowed
reopen and stale version are rejected before a canonical close transition is
written. Blocking or policy-blocked exceptions cannot be acknowledged as a close
shortcut.

## UI states

Operations shows only server-returned close state, period, observation count,
policy version and reopen state. It also shows an explicit `ready` or `blocked`
readiness result for the current or selected business date, including missing
observation kinds, unacknowledged exception count and links to the server-authored
Board source or observation capture surface.
Loading/error is explicit; the UI never infers a close from a healthy projection.
