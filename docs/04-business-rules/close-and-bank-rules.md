# Operational close and bank-statement rules

These rules add narrow, policy-backed reconciliation facts. They do not replace
the commercial, physical or financial ledgers that produce the source facts.

### BR-CLOSE-001 — Close is an append-only signoff over source observations

`RecordOperationalClose` stores the business date, configured Vietnam business-day
period, exact `ReconciliationObservation` IDs, evidence references and the approved
`operating_cycle_reconciliation` policy version. It does not calculate or rewrite
cash, debt, payable or inventory.

### BR-CLOSE-002 — Close requires an effective approved strategy

The only supported strategy is `observation_signoff`. It requires exactly one
observation for every configured kind and each observation must carry a measurable
expected amount, observed amount, quantity or item count. An observation must
also have `transactionTime` inside the closed business-day period; an observed
value is sufficient when no expected value exists. Missing policy, malformed
definition, missing observation or cross-workspace reference fails closed.

### BR-CLOSE-003 — A business date has one explicit state transition

The workspace/date uniqueness constraint prevents two close identities. Reopen is
an append-only `OperationalCloseReopen` fact controlled by the approved policy and
`expectedVersion`; a retry or stale version cannot create a second transition.

### BR-CASH-012 — Statement match is exact and financial-neutral

`RecordCashStatementMatch` matches one existing CashMovement by workspace, account,
amount, currency, source type and external reference under the approved
`cash_custody_deposit` policy. It never changes CashMovement, CashBalance, customer
debt or supplier payable. Matching the same command returns the original result.

### BR-CASH-013 — Statement correction is compensation, not mutation

Reversal appends one `CashStatementMatchReversal` after authorization and an
`expectedVersion` check. The original match remains readable, and reversing a match
does not create a cash movement or ledger entry.

### BR-CASH-014 — Backup and restore preserve reconciliation lineage

Backup V19 carries close, reopen, statement-match and statement-reversal rows.
Restore validates every workspace, policy, observation, cash-account and movement
reference before inserting the rows into an empty target, then rechecks canonical
projections.

## Supported boundary

These adapters do not claim settlement, variance calculation, bank balance
reconciliation, COGS, aging, forecast or management KPI semantics. Those remain
unavailable until their separate field policy and source contracts are closed.
