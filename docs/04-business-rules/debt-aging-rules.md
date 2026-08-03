# Debt aging rules

These rules define the policy-backed receivable read model. The customer account
ledger remains the financial source of truth.

### BR-AGING-001 — Aging has no implicit global policy

An `account.aging` read is unavailable unless both an approved effective
`payment_terms_aging` policy and an approved effective `payment_allocation` policy
exist at the requested `asOf`. Missing or invalid policy is never replaced with a
global default.

### BR-AGING-002 — Aging is deterministic and integer-money based

The calculation uses integer minor units, deterministic `(transactionTime, id)`
ordering, and the selected policy strategy. Automatic allocation supports
`oldest_due_first` and `oldest_transaction_first`. A manual or specific-sale
strategy without persisted allocation records fails closed.

### BR-AGING-003 — Aging reconciles against canonical facts

The read includes workspace-scoped source references and compares the account
ledger balance with posted sales less effective payments. Mixed currencies or an
unexplained ledger balance produce `attention` diagnostics, never a healthy
financial answer.

### Evidence

- `packages/domain-kernel/src/debt/debt.test.ts`
- `apps/api/src/modules/account/debt-aging.app.test.ts`
- `packages/db/src/repositories/read/account.ts`
