# Time semantics

Four timestamps, four meanings. Collapsing any two of them loses information that
cannot be recovered later.

| Field             | Set by                     | May be back-dated | Answers                                |
| ----------------- | -------------------------- | ----------------- | -------------------------------------- |
| `transactionTime` | The command (`occurredAt`) | **yes**           | When did this actually happen?         |
| `recordedAt`      | Server clock at commit     | never             | When did we learn about it?            |
| `createdAt`       | Database default           | never             | When was this row inserted?            |
| `updatedAt`       | Server on update           | never             | When did this mutable row last change? |

## Why not one timestamp

A sale at 05:00 is entered at 11:00 because the worker was carrying crates.

- Debt aging must count from **05:00**. Using 11:00 would make every back-dated
  entry look fresher than it is, and "who is 30 days overdue" would be wrong in the
  depot's favour — the direction that loses money.
- The audit trail must show **11:00**. Using 05:00 would hide a six-hour reporting
  gap, and would make it impossible to distinguish an honest late entry from a
  back-dated one entered to move a balance across a month boundary.

Both facts matter, and neither can be derived from the other. So both are stored.

## Which field each concern reads

| Concern                                | Field                                         | Why                                     |
| -------------------------------------- | --------------------------------------------- | --------------------------------------- |
| Debt aging, "overdue by N days"        | `transactionTime`                             | Business reality                        |
| Daily/monthly revenue reporting        | `transactionTime`                             | A sale belongs to the day it happened   |
| Ledger ordering on the customer screen | `transactionTime`, tie-broken by `recordedAt` | Reads like the paper book               |
| Audit, "what did this worker do today" | `recordedAt`                                  | Operational reality                     |
| Debugging, incident timelines          | `recordedAt`                                  | When the system saw it                  |
| Idempotency-window reasoning           | `recordedAt`                                  | A property of the request, not the sale |

## `updatedAt` — where it is and is not

Present on mutable rows only: `customers`, `products`, `workspaces`,
`customer_account_balances` (a projection).

**Absent from `customer_account_entries`, `payment_reversals`, and `audit_logs`** — a
column that can never change should not exist, because its presence invites an
`UPDATE`. Their `recordedAt` is the whole story.

`payments` has no `updatedAt` either, even though `reversed_amount` and `status`
do change: the _when_ of that change belongs to the reversal record, which has its
own `transactionTime` and `recordedAt`.

## Validation

- `occurredAt` may be arbitrarily far in the past. Back-dating is normal.
- `occurredAt` may not be in the future beyond **5 minutes** of clock skew
  (BR-COMMAND-004) — cheap phones drift; a genuinely future-dated sale is a wrong
  device clock, and accepting it puts entries past the horizon of every report.
- `recordedAt` is never accepted from a client. It is the server's clock, read once
  per command and used for every row that command writes, so all effects of one
  command share a single `recordedAt`.

## Storage and time zone

All instants stored as `timestamptz` (UTC). Vietnam is UTC+07:00 with no daylight
saving, so display conversion is a fixed offset and belongs in the presentation
layer. Nothing in the backend stores a local time.

Commands accept an offset (`2026-07-26T05:00:00+07:00`) and it is normalised to UTC
on the way in. Rejecting non-UTC input would push timezone arithmetic onto a phone,
which is where it goes wrong.

## Related

- [data-model.md](data-model.md), [ledger-model.md](ledger-model.md)
- BR-COMMAND-003, BR-COMMAND-004 in [../04-business-rules/customer-account-rules.md](../04-business-rules/customer-account-rules.md)
