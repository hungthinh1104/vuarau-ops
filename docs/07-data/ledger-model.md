# Debt ledger model

The one design decision the rest of the system is built around.

## The rule

**What a customer owes is the sum of their ledger entries. It is not a stored
number that anything updates.**

```
balance(customer) = Σ debt_ledger_entries.amount_minor
                    WHERE workspace_id = ? AND customer_id = ?
```

`customer_debt_summaries` holds that sum for fast reads. It is a cache with a
rebuild function, not a source of truth ([ADR-0004](../09-decisions/ADR-0004-append-only-debt-ledger.md)).

## Sign convention

Applied everywhere, without exception:

| Sign         | Meaning                | Produced by                                                              |
| ------------ | ---------------------- | ------------------------------------------------------------------------ |
| **positive** | customer owes **more** | `order_confirmation`, `payment_reversal`, `manual_adjustment` (increase) |
| **negative** | customer owes **less** | `payment`, `manual_adjustment` (decrease)                                |

A single signed integer, not a `direction` column plus a magnitude. Two fields
that must agree eventually disagree; summing one column cannot go wrong. Callers
that want a direction derive it (`amountMinor >= 0`).

## Entry shape

```ts
{
  id, workspaceId, customerId,
  amount: { amountMinor, currency },   // signed
  sourceType,                          // order_confirmation | payment | payment_reversal | manual_adjustment
  sourceId,                            // the order / payment / reversal / adjustment
  reversalOfEntryId,                   // set when compensating a specific entry
  reasonCode, reason,                  // required for manual_adjustment
  transactionTime,                     // when it happened
  recordedAt,                          // when we wrote it
  actorId, commandId,                  // who, and by which command
}
```

`actorId` and `commandId` are `NOT NULL` (BR-DEBT-004). Every đồng of movement
traces to a person and a request.

## Append-only, enforced three ways

1. No repository method updates or deletes an entry.
2. No Drizzle call in the codebase does either.
3. A Postgres trigger raises on `UPDATE` or `DELETE` against the table.

The third exists because the first two protect only the code we wrote today.

## Corrections are compensations

To undo a `−500 000` payment entry, append a `+500 000` entry with
`sourceType = payment_reversal` and `reversalOfEntryId` pointing at the original.

Both remain. The customer's history reads:

```
2026-07-20  order confirmed        +875 000    875 000
2026-07-22  payment received       −500 000    375 000
2026-07-23  payment reversed       +500 000    875 000   ← reverses entry 2
```

Not:

```
2026-07-20  order confirmed        +875 000    875 000
```

...which is what deleting the payment would leave — a book that cannot explain
itself, and a customer conversation nobody can win.

## Duplicate prevention at the storage layer

```sql
UNIQUE (source_type, source_id)
```

One confirmation of order X can produce at most one `order_confirmation` entry for
X. A bug that tries to append twice hits a constraint violation and rolls the
transaction back. The idempotency layer prevents this case; the constraint means a
future code path that forgets to cannot corrupt a balance.

## The summary projection

```ts
{
  (workspaceId, customerId, balance, entryCount, lastEntryTransactionTime, updatedAt);
}
```

- Updated **inside the same transaction** as the entry that moved it. It is never
  stale in the way an asynchronous projection can be.
- Rebuildable at any time via `rebuildCustomerDebtSummary` (BR-DEBT-006).
- Safe to delete. Recreating it costs one `SUM` over an indexed range.

That last property is the point. When a projection can be discarded and
recomputed, a bug in it is an inconvenience. When the balance _is_ the truth, the
same bug is a dispute with a customer.

## Currency

Every entry carries its currency. Mixed-currency sums are refused rather than
silently added. Only VND exists today; the guard is three lines and the failure it
prevents is unrecoverable.

## What this is not

Not double-entry bookkeeping. There is one account — what this customer owes this
depot — and no contra account, no trial balance, no chart of accounts. A depot
needs to know who owes what, not to produce financial statements. If real
accounting is needed later, this ledger is the input to it, not a broken version
of it.

## Related

- [data-model.md](data-model.md), [time-semantics.md](time-semantics.md)
- [../04-business-rules/debt-rules.md](../04-business-rules/debt-rules.md)
- [../05-casebook/debt-cases.md](../05-casebook/debt-cases.md)
