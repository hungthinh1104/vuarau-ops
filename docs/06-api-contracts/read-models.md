# Read models

The query side of the API: nine procedures a first UI needs, added in the same
router as the commands.

Source of truth in code: `packages/domain-contracts/src/*/index.ts` for the DTOs,
`packages/db/src/repositories/read-queries.ts` for the SQL,
`apps/api/src/modules/shared/read-pipeline.ts` for the guard every read runs.

## The surface

| Procedure          | Permission      | Returns                           | Use case        |
| ------------------ | --------------- | --------------------------------- | --------------- |
| `session.me`       | — (identity)    | `SessionDto`                      | UC-AUTH-003     |
| `customer.search`  | `customer.read` | page of `CustomerSummaryDto`      | UC-CUSTOMER-002 |
| `customer.get`     | `customer.read` | `CustomerDetailDto`               | UC-CUSTOMER-003 |
| `sale.get`         | `sale.read`     | `SaleDto` + `replacedBySaleId`    | UC-SALE-003     |
| `sale.list`        | `sale.read`     | page of `SaleSummaryDto`          | UC-SALE-003     |
| `payment.get`      | `payment.read`  | `PaymentSummaryDto`               | UC-PAYMENT-003  |
| `payment.list`     | `payment.read`  | page of `PaymentSummaryDto`       | UC-PAYMENT-003  |
| `account.timeline` | `debt.read`     | page of `AccountTimelineEntryDto` | UC-ACCOUNT-001  |
| `audit.timeline`   | `audit.read`    | page of `AuditTimelineEntryDto`   | UC-AUDIT-001    |

`session.me` is the only one that requires no permission: the answer _is_ the
permission list, and demanding one to read it would be circular. It still needs a
verified identity and an active membership.

## Authorization

Every read runs `authorizeWorkspaceAccess` — the same four steps a command runs
(BR-AUTH-001). Reads are where this was missed once already: before Milestone 1,
`debt.summary` and `debt.ledger` answered for **any** workspace id handed to them,
because isolation had been enforced on the write path only. That is the shape of
mistake one query at a time produces, which is why `runQuery` exists rather than a
convention.

The check runs **inside the transaction** with the read it guards, so a membership
revoked while a query is running cannot let that query finish.

## Pagination

Keyset, never `OFFSET`.

```
WHERE (sort_column, id) < (:sortValue, :id)     -- descending lists
ORDER BY sort_column DESC, id DESC
LIMIT :limit + 1                                 -- the extra row answers "is there more"
```

Both halves of the key are load-bearing. A sort value alone is not unique — a
depot posting a morning's load produces sales sharing a `transactionTime` to the
millisecond — so a boundary that knew only the timestamp would repeat rows or skip
them.

`OFFSET` is excluded for two reasons: it re-reads the rows it skips, and it shifts
under concurrent inserts. A sale posted while somebody is paging pushes a row they
have already seen onto the next page. When the list is money, a page boundary that
silently duplicates a row is a support call. TC-READ-004 asserts exactly this: a
sale inserted mid-walk does not shift the boundary.

| List               | Sort key                 | Direction  |
| ------------------ | ------------------------ | ---------- |
| `customer.search`  | `(display_name, id)`     | ascending  |
| `sale.list`        | `(transaction_time, id)` | descending |
| `payment.list`     | `(transaction_time, id)` | descending |
| `account.timeline` | `(transaction_time, id)` | descending |
| `audit.timeline`   | `(recorded_at, id)`      | descending |

The audit timeline is the odd one, deliberately. It orders by **recording** time
because an audit trail answers "in what order did this system learn things", and a
back-dated sale belongs where it was written down. The account timeline orders by
**business** time, because aging is a question about when money moved
([time-semantics](../07-data/time-semantics.md)).

### Cursors

Opaque base64url carrying `[sortValue, id]`. A client that parses one has coupled
itself to a sort key we intend to be free to change.

The codec uses `TextEncoder`/`btoa`, not `Buffer`: `domain-contracts` is imported
by browser code, and a `Buffer` here would pass every test and fail in the first
browser to load it. Vietnamese display names are a sort value, so the UTF-8 step
is not optional — `btoa("Cô Hoà")` throws.

A cursor that does not decode is treated as "start from the beginning" rather than
as an error. Cursors travel in URLs, URLs get truncated and hand-edited, and a 500
turns a cosmetic problem into a broken screen.

There is no total count. Counting the whole set costs a scan the page does not
need, and every consumer so far wants "is there more", which `nextCursor` answers.

## What a read returns

- **Never a database row.** Every projection is an explicit field-by-field map to
  a published DTO. A `SELECT *` that grows a column must not silently grow the
  public contract.
- **Both timestamps, separately.** `transactionTime` is when it happened;
  `recordedAt` is when we recorded it (BR-COMMAND-003).
- **Integers only.** Money is `{ amountMinor, currency }` and quantities are
  integer milli-units, so nothing on the wire is a float or a `bigint` a JSON
  encoder would have to guess about (ADR-0006).
- **The aggregate version**, so a client can send it back as `expectedVersion`.
- **Server-computed derived state**: a sale's `financialState` and `dueState`, an
  account balance's `classification`. A client that computed these would be one
  `<` away from rendering a credit as a debt (BR-ACCOUNT-009, BR-SALE-017).
- **Capabilities**, from the same functions the command guards use (ADR-0003).

### Capabilities on a list row

A list row has facts — status, line count, whether a void exists — not a whole
aggregate. Loading the lines to compute `post` would be an N+1 across the page.

So the kernel exposes both: `saleCapabilities(sale)` for a detail read and
`saleSummaryCapabilities(facts)` for a list row. They share their implementation,
and differ in exactly one way: the list cannot check line _validity_, so it
returns `allowed` where the detail would return `SALE_LINE_INVALID`. That is the
correct direction to be wrong in — a capability is advisory and the command
re-validates from the aggregate it loads — and it is reachable only for a draft
stored before BR-SALE-003 was enforced, which no write path allows.

TC-READ-004 asserts the list and the detail agree, so the two cannot drift.

## No N+1

Everything a list needs is joined into the page query:

| List               | Joined in                                                          |
| ------------------ | ------------------------------------------------------------------ |
| `customer.search`  | balance projection (LEFT — no entries means zero, not missing)     |
| `sale.list`        | customer name, void record, replacement sale, line count           |
| `payment.list`     | customer name                                                      |
| `account.timeline` | sale, sale void, payment, reversal — one LEFT JOIN per source kind |
| `audit.timeline`   | actor name, and the sale a record corrects                         |

The account timeline's running balance is a window function over the customer's
**whole** history in business-time order, so an entry shows the same balance
whichever page it lands on — a page is a slice, and a slice cannot know what came
before it. That makes it O(n) in the customer's entries per request. At a depot's
scale that is the right trade for a number that must never disagree with the
balance projection; if a history ever makes it hurt, the fix is a stored running
total, not a client-side sum.

## Indexes

Added in migration `0005`, and only for queries that exist. An index no query uses
costs every write and pays back nothing.

Each is `(filter columns, then the keyset sort key)`, so Postgres walks the index
in the order the page needs rather than sorting a result set afterwards.

`vuarau_fold` is an IMMUTABLE SQL function, not the `unaccent` extension: it needs
nothing installed, and it folds `đ`/`Đ`, which Vietnamese names are full of and
which generic unaccenting leaves alone. No expression index backs it yet — a
depot's customer list does not warrant one — but being IMMUTABLE means one can be
added the day it does.

## Related

- [capabilities.md](capabilities.md), [ui-state-catalog.md](ui-state-catalog.md)
- [command-contracts.md](command-contracts.md) — the write side
- [../04-business-rules/authorization-rules.md](../04-business-rules/authorization-rules.md)
- [../02-use-cases/use-case-catalog.md](../02-use-cases/use-case-catalog.md)
