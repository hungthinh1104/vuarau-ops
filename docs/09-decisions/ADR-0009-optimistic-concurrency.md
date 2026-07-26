# ADR-0009 — Optimistic concurrency for aggregate changes

**Status:** accepted · 2026-07-26

## Context

Several workers use the system at once, often on the same customer during a busy
morning. Two phones can have the same sale draft open. Two people can try to
reverse the same payment.

The unacceptable outcome is a **silent** lost update: phone B posts a sale
whose lines it never saw, and the customer is billed a total nobody intended.

Note that concurrency and retry are different problems. Idempotency (ADR-0008)
handles _the same_ command arriving twice. This handles _different_ commands
racing on the same aggregate.

## Decision

1. `sales`, `payments`, and `customers` carry `version integer NOT NULL`, starting
   at 1 and incremented by exactly one per successful state change.
2. Commands that modify an existing aggregate carry a mandatory `expectedVersion`.
   Creation commands do not have the field at all.
3. Inside the command transaction, the aggregate is loaded with
   `SELECT … FOR UPDATE`. If `expectedVersion ≠ stored version`, the command is
   refused with `ORDER_VERSION_CONFLICT` / `PAYMENT_VERSION_CONFLICT`, carrying
   both values in `details`.
4. The row lock is held for the (short) duration of the transaction, so the check
   and the write cannot be interleaved.
5. Version conflicts are **not** retryable. The client must re-read and let the
   user decide.

`SELECT … FOR UPDATE` combined with a version check is belt and braces on purpose:
the lock serialises concurrent handlers, and the version check catches the case
where the client's view is stale from _before_ either transaction started — which
no lock can detect.

## Alternatives considered

| Alternative                                           | Why not                                                                                                                                                                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Last-write-wins                                       | The silent lost update. Disqualified.                                                                                                                                                                    |
| Pessimistic locking held across the user's think-time | A worker who opens a sale and walks away blocks everyone. Locks must not span a human.                                                                                                                   |
| `SERIALIZABLE` isolation                              | Correct, but converts a precise, explainable `ORDER_VERSION_CONFLICT` into a generic serialisation failure that the UI cannot explain to a user. Also costs more under contention than a version column. |
| Field-level merge (CRDT-style)                        | Merging two versions of a money document without a human deciding is exactly what should not happen.                                                                                                     |
| Automatic retry on conflict                           | Retrying re-applies an intent formed against stale data. That is the bug, not the fix.                                                                                                                   |

## Consequences

**Good.** Lost updates are impossible, and the conflict is explainable: "someone
else changed this sale — here is the current version". No lock spans user
think-time. Version numbers are a cheap, readable audit of how many times an
aggregate changed.

**Bad.** Clients must track and send versions. A conflict is a real interruption
for the user — but a truthful one, and the alternative is a wrong total.

**Neutral.** The customer account ledger needs none of this: entries are appended, never
updated, so there is nothing to conflict over. The summary projection is upserted
inside the same transaction and is idempotent by construction.

## Revisit when

- Contention on a single aggregate becomes common enough that users see frequent
  conflicts — which would indicate the aggregate boundary is wrong, not the
  concurrency strategy.
- Offline sync arrives and needs a merge policy for genuinely divergent edits. That
  is a product decision about what a worker sees, not a storage one.
