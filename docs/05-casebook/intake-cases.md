# Inspected intake casebook

## CASE-INTAKE-001 — Gross, tare and net evidence

A truck delivers 105 kg gross in ten containers with 5 kg tare. The line records 100 kg arrived/net. A different unit, missing component or arithmetic mismatch is rejected before any fact is stored.

## CASE-INTAKE-002 — Partial inspection and mixed outcome

An arrival line contains 100 kg. Staff inspect 80 kg, accept 60 kg and quarantine 20 kg. Inventory increases by 60 kg only; the line has no further eligible quantity until more of the arrival is inspected.

## CASE-INTAKE-003 — Resolve quarantine

A quarantined 20 kg allocation is inspected again and resolved to accepted, rejected or disposed. It cannot be quarantined a second time. Accepted resolution creates inventory against the original arrival-line product.

## CASE-INTAKE-004 — Reverse in dependency order

An accepted disposition cannot be ignored by reversing its inspection or arrival. Staff first reverse any child quarantine resolution, then the parent disposition, then inspection, then arrival. Every accepted reversal appends the exact inverse stock movement.

## CASE-INTAKE-005 — Purchase protection before acceptance

Goods have physically arrived against a Purchase but are still awaiting inspection. Purchase void is blocked because commercial history cannot erase known physical custody. After the complete arrival chain is reversed, void may proceed.

## CASE-INTAKE-006 — Profile changes after history exists

A depot changes from inspected intake back to direct receipt. New inspected facts are blocked, but old arrivals remain readable and their reversals remain executable. The mode switch cannot strand historical evidence.

## CASE-INTAKE-007 — Backup and recovery

Backup V10 exports master codes, price rules, cost/reconciliation observations and every physical fact as canonical table-shaped records. Restore rejects missing cross-references, rebuilds inventory projections and succeeds only when source lineage reconciles.
