# ADR-0007 — Explicit `transactionTime` and `recordedAt`

**Status:** accepted · 2026-07-26

## Context

Depot work is not entered as it happens. A sale at 05:00 gets typed at 11:00
because the worker was carrying crates. A payment taken with no signal is uploaded
three hours later.

A single `created_at` forces a choice between two facts that are both needed:

- debt aging must count from when the sale happened, or every back-dated entry
  looks fresher than it is — and the error runs in the depot's favour, which is
  the direction that loses money;
- audit must show when the system learned about it, or an entry back-dated across
  a month boundary is indistinguishable from an honest late one.

## Decision

Four timestamps, four meanings (see
[time-semantics.md](../07-data/time-semantics.md)):

| Field             | Source                    | Back-datable |
| ----------------- | ------------------------- | ------------ |
| `transactionTime` | `command.occurredAt`      | **yes**      |
| `recordedAt`      | server clock at commit    | no           |
| `createdAt`       | database default          | no           |
| `updatedAt`       | server, mutable rows only | no           |

- Debt aging and business reporting read `transactionTime`.
- Audit and operational debugging read `recordedAt`.
- `recordedAt` is read **once per command** and stamped on every row that command
  writes, so all effects of one command share one recording instant.
- `occurredAt` may be arbitrarily far in the past; no more than 5 minutes in the
  future (BR-COMMAND-004).
- `updatedAt` is absent from immutable tables — a column that can never change
  should not exist, because its presence invites an `UPDATE`.

## Alternatives considered

| Alternative                                                                            | Why not                                                                                                                                                             |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One `created_at`                                                                       | Loses one of two needed facts. Which one is lost depends on who is asking, which is the tell that both are needed.                                                  |
| Server time only, no back-dating                                                       | Makes offline capture unusable and pushes workers to enter fictional data at fictional times.                                                                       |
| Client time only                                                                       | An unsynchronised phone clock silently corrupts every report.                                                                                                       |
| Full bitemporal modelling (valid time + system time on every row, with history tables) | The rigorous general answer. Far more machinery than two columns, and the ledger's append-only history already provides the system-time dimension where it matters. |

## Consequences

**Good.** Back-dated entry is a first-class case rather than a workaround. Aging
is correct for offline-captured data. The gap between the two timestamps is itself
useful — it shows how far behind reality the books are running.

**Bad.** Every business row carries two timestamps, and every query author must
know which one to use. Mitigated by the table in
[time-semantics.md](../07-data/time-semantics.md) and by the fact that
`transactionTime` is the one on every index used for reporting.

**Neutral.** All instants stored `timestamptz` in UTC. Vietnam is UTC+07:00 with
no DST, so display conversion is a fixed offset in the presentation layer.

## Revisit when

- A regulator requires bitemporal correction history (retroactively changing what
  a past entry _said_ it was). The ledger's compensating-entry model covers
  correction of _effect_, not of _record_, and that distinction would then matter.
