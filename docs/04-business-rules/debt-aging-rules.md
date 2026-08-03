# Debt aging rules

These rules define the policy-backed receivable read model. The customer account
ledger remains the financial source of truth.

### BR-AGING-001 — Aging has no implicit global policy

An `account.aging` read is unavailable unless both an approved effective
`payment_terms_aging` policy and an approved effective `payment_allocation` policy
exist at the requested `asOf`. Missing or invalid policy is never replaced with a
global default. Manual attribution commands also require an approved effective
allocation policy; an attribution is never accepted outside its workspace.

### BR-AGING-002 — Aging is deterministic and integer-money based

The calculation uses integer minor units, deterministic `(transactionTime, id)`
ordering, and the selected policy strategy. Automatic allocation supports
`oldest_due_first` and `oldest_transaction_first`. A manual or specific-sale
strategy consumes persisted allocation records and their append-only reversals;
without those records it fails closed.

### BR-AGING-003 — Aging reconciles against canonical facts

The read includes workspace-scoped source references and compares the account
ledger balance with posted sales less effective payments. Mixed currencies or an
unexplained ledger balance produce `attention` diagnostics, never a healthy
financial answer.

### BR-AGING-004 — Payment attribution is append-only and compensating

Allocating a payment to a posted sale does not create or alter a customer ledger
entry. Reversing an attribution creates one compensation record, is bounded by
the remaining allocation, and is included in historical aging only at its
`transactionTime`.

### Evidence

- `packages/domain-kernel/src/debt/debt.test.ts`
- `apps/api/src/modules/account/debt-aging.app.test.ts`
- `packages/db/src/repositories/read/account.ts`
- `apps/api/src/modules/account/payment-allocation.app.test.ts`
