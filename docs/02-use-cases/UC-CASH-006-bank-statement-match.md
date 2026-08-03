# UC-CASH-006 — Match a bank statement line to a CashMovement

## Intent

An authorized owner or accountant links one external statement line to one existing
cash movement without changing the cashbook or either debt ledger.

## Contract

- Actor: owner or accountant.
- Permission/workflow: `cash.statement.match` and enabled `cashbook` workflow.
- Preconditions: an approved effective `cash_custody_deposit` policy and a
  workspace-scoped CashMovement.
- Input: match ID, cash account, movement ID, external reference, statement time,
  exact amount/currency and evidence references.
- State: one active match per movement and external reference; reversal is an
  append-only correction row.
- Idempotency: identical command identity and exact match identity return the same
  match; a conflicting identity is rejected.
- Effects: no CashMovement, CashBalance, customer account entry or supplier account
  entry is appended.
- Audit: match and reversal retain policy lineage, actor, command and evidence.

## Fail-closed paths

Missing policy or movement, foreign workspace, account/amount mismatch, unsupported
source type, duplicate identity, disallowed reversal and stale version are rejected.

## UI states

Operations lists only persisted match/reversal state and exact amount/reference.
Unavailable or failed reads remain explicit and do not show a guessed settlement.
