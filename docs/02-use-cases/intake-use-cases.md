# Inspected intake use cases

## UC-INTAKE-001 — Manage quality issue codes

An authorized quality role creates and maintains workspace-scoped condition or defect codes. Codes are deactivated rather than deleted, while inspections retain code and name snapshots.

## UC-INTAKE-002 — Record and reverse goods arrival

An intake role records the supplier, optional confirmed Purchase, vehicle reference, physical lines and optional gross/tare/net observations. Arrival is evidence only. Reversal is permitted only when no active inspection or disposition remains.

## UC-INTAKE-003 — Record and reverse quality inspection

A quality role records inspected quantity, issue snapshots, notes and evidence references for an active arrival line. Cumulative active inspection coverage cannot exceed arrived quantity. Reversal requires downstream dispositions to be reversed first.

## UC-INTAKE-004 — Decide quality outcome

A quality role allocates eligible quantity to accepted, quarantined, rejected or disposed outcomes. Accepted allocations create graded inventory movements atomically. Quarantined quantity may later be resolved through its allocation identity.

## UC-INTAKE-005 — Reverse a quality disposition

An authorized quality role reverses a disposition only when no active child disposition remains. Accepted allocations produce exact inverse inventory movements; non-accepted outcomes retain their reversal evidence without stock effects.

## UC-INTAKE-006 — Inspect intake state and lineage

Readers list arrivals, inspect an arrival or quality fact, and request a source summary showing source, inspected, allocated, remaining and currently eligible quantities. Historical facts stay readable after profile changes.

## Operational profile behavior

`direct_receipt` keeps the existing Purchase receipt path. `inspected_arrival` replaces that entry path with arrival → inspection → disposition. `gross_tare_net` is valid only with inspected arrival. “Bông hàng” remains undefined and outside this scope.
