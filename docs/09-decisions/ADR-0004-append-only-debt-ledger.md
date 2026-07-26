# ADR-0004 — Append-only customer account ledger with a rebuildable summary

**Status:** accepted · 2026-07-26

## Context

Customer debt (công nợ) is the most contested number in a depot. The owner and the
customer will disagree about it, sometimes months later, and the system's job is to
explain the number rather than merely state it.

The naive design is `customers.balance`, updated on every event. It answers
"how much?" quickly and "why?" never. When it is wrong — and a mutable running total
eventually is — there is nothing to recompute it from.

## Decision

1. `customer_account_entries` is the source of truth. Append-only: no `UPDATE`, no
   `DELETE`, enforced by repository shape _and_ by a Postgres trigger.
2. Balance = `SUM(amount_minor)` over a customer's entries.
3. `customer_account_balances` caches that sum, maintained **inside the same
   transaction** as the entry that moves it, and rebuildable from the entries at
   any time.
4. Corrections are compensating entries. Reversing a payment appends `+amount`
   with `reversalOfEntryId` pointing at the original; the original stays.
5. Every entry carries `actorId`, `commandId`, `transactionTime`, `recordedAt`, and
   — for manual adjustments — a mandatory reason.

## Alternatives considered

| Alternative                                  | Why not                                                                                                                                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mutable `customers.balance`                  | Cannot explain itself, cannot be repaired, and every concurrent write is a lost-update risk.                                                                                                         |
| Ledger with a _periodically_ rebuilt summary | A window during which the displayed balance is wrong. In-transaction maintenance costs one indexed upsert and removes the window entirely.                                                           |
| Full event sourcing across all aggregates    | The benefit is exactly what the ledger already provides, for the one aggregate that needs it. Applying it to customers and products buys replay nobody wants and a projection framework to maintain. |
| Double-entry bookkeeping                     | A depot needs "who owes what", not a trial balance. The contra-account discipline would be ceremony with no reader. This ledger can _feed_ real accounting later.                                    |

## Consequences

**Good.** Every balance is explainable down to the command and person that moved
it. A wrong projection is repaired with a `SUM`, not a reconciliation meeting.
Reversals preserve history, which is what makes a disputed payment a conversation
about records rather than about memory.

**Bad.** Reading a balance means either the projection or an aggregate query — you
cannot just select a column. Entry volume grows without bound; a customer with
years of history accumulates thousands of rows. Both are addressed by the index on
`(workspace_id, customer_id, transaction_time DESC)`, and by period-opening balance
entries if it ever becomes a real problem.

**Neutral.** The ledger is single-entry. It records one relationship — what this
customer owes this depot — and nothing else.

## Revisit when

- Statutory accounting output is required (then this becomes the input to a proper
  ledger, not a replacement for one).
- Entry volume per customer makes aggregate queries slow enough to matter, at which
  point periodic opening-balance entries are the answer — not a mutable total.
