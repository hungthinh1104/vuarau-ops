# UC-SALE-002 — Post a sale

**Risk:** P0 · **Status:** implemented · **Command:** `PostSale`

The most financially significant action in the system: the moment a customer
starts owing money. Every other use case in this document set is written against
the template this one establishes.

| Field          | Value                                                                                |
| -------------- | ------------------------------------------------------------------------------------ |
| **Actor**      | Depot owner or sales worker, authenticated (UC-AUTH-001)                             |
| **Trigger**    | The load is on the buyer's vehicle and the price is agreed. The worker taps **Chốt** |
| **Permission** | `sale.post` — held by `owner`, `sales`                                               |
| **Result DTO** | `SaleDto` with `status: posted`, `financialState: active`, `capabilities`            |

## Preconditions

- A `draft` sale exists in this workspace.
- The caller knows its current `version` (from the read that put it on screen).
- Final accepted quantity and agreed unit price are entered on every line — this is
  what "posted" asserts (approved decision 4).

## Inputs

```
commandId, idempotencyKey, workspaceId, actorId, occurredAt, expectedVersion
payload: { saleId }
```

Nothing about the sale's contents is in the payload. Posting commits **what is
stored**, not what the client believes is stored; sending lines here would let a
stale screen post a total nobody agreed to.

## Happy path

1. Transport verifies the bearer token and resolves the actor (BR-AUTH-001).
2. Pipeline authorizes: not impersonating, active member, holds `sale.post`.
3. Pipeline claims the idempotency key (ADR-0008).
4. Handler loads the sale `FOR UPDATE` inside the transaction (ADR-0009).
5. Domain checks, in order: version matches (BR-SALE-006), status is `draft`
   (BR-SALE-005), at least one line (BR-SALE-002), every line valid
   (BR-SALE-003), currencies consistent (BR-SALE-009).
6. Domain recomputes every `lineTotal` and the total (BR-SALE-001, BR-SALE-004)
   and freezes the line snapshots (BR-SALE-011).
7. Domain emits **exactly one** account entry: `+totalAmount`,
   `sourceType = sale_posting`, `sourceId = saleId`,
   `transactionTime = command.occurredAt` (BR-SALE-007).
8. One transaction commits: sale → `posted` at `version + 1`, the account entry,
   the balance projection, the audit record, and the completed receipt.

## Alternative and rejection paths

| Situation                                    | Outcome                                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| Sale not in this workspace                   | `SALE_NOT_FOUND` — never "wrong workspace", which would confirm it exists     |
| `expectedVersion` stale                      | `SALE_VERSION_CONFLICT` (BR-SALE-006), with both versions in `details`        |
| Sale already posted                          | `SALE_ALREADY_POSTED` (BR-SALE-005)                                           |
| Sale has no lines                            | `SALE_EMPTY` (BR-SALE-002)                                                    |
| A line has zero quantity or a negative price | `SALE_LINE_INVALID` (BR-SALE-003), with `lineIndex` and `lineId`              |
| A line's currency differs from the sale's    | `SALE_CURRENCY_MISMATCH` (BR-SALE-009)                                        |
| Caller's role lacks `sale.post`              | `PERMISSION_DENIED`, naming the permission and the role                       |
| Same command retried after a timeout         | The original `SaleDto`, balance unchanged (BR-COMMAND-001)                    |
| Sale happened yesterday, entered today       | Accepted; `transactionTime` is yesterday, `recordedAt` today (BR-COMMAND-003) |
| `occurredAt` in the future                   | `TRANSACTION_TIME_IN_FUTURE` (BR-COMMAND-004)                                 |

## State transition

T-SALE-002: `draft` → `posted`, version + 1. Terminal — nothing moves this row
again (BR-SALE-008).

## Account effect

One entry, `+total`. The customer's balance increases by exactly the sale total;
`classification` becomes `receivable` unless prepaid credit already covers it
(BR-ACCOUNT-009).

## Audit effect

One record: `action = sale.posted`, `aggregateType = sale`, `aggregateId = saleId`,
`before = { status: draft, version }`, `after = { status: posted, version,
totalMinor, currency }`, naming the authenticated actor and the command.

## Idempotency

`idempotencyKey` is required. A replay returns the stored `SaleDto` and writes
nothing (BR-COMMAND-001). Beyond that, `UNIQUE (source_type, source_id)` on the
account entries makes a second entry for this sale unrepresentable even if the
replay check were bypassed (BR-SALE-007).

## Concurrency

`expectedVersion` is mandatory and re-checked at write time against the locked row
(ADR-0009). Two workers posting the same draft: one succeeds, the other gets
`SALE_VERSION_CONFLICT` and is told to reload — never a silent overwrite.

## Offline policy

Fully supported. The client generates `saleId`, the line ids, `commandId` and
`idempotencyKey` locally, records `occurredAt` at the moment of the trade, and
submits when a connection returns. Back-dating is expected; forward-dating beyond
five minutes of clock skew is refused (BR-COMMAND-004).

`expectedVersion` is the one thing that cannot be captured offline reliably: if
somebody edited the draft meanwhile, the queued command is refused rather than
applied to a sale the worker never saw.

## Capabilities

`SaleDto.capabilities.post` is `allowed` only when the sale is `draft` with at
least one valid line; otherwise it carries the exact code the command would return.
`void` is `allowed` only once posted. Both are computed by the functions the guards
use, so a greyed-out button and a server refusal cannot disagree (ADR-0003).

## UI states

`loading`, `validation_error`, `business_rejection`, `permission_denied`,
`stale_version`, `duplicate_safe_retry`, `unknown_network_outcome`,
`sale_posted`. See the [UI state catalog](../06-api-contracts/ui-state-catalog.md).

## Rules

BR-SALE-001 … BR-SALE-011, BR-AUTH-001 … BR-AUTH-004, BR-COMMAND-001,
BR-COMMAND-003, BR-COMMAND-004, BR-COMMAND-005, BR-COMMAND-006, BR-ACCOUNT-002,
BR-ACCOUNT-004

## Cases

CASE-SALE-001 … CASE-SALE-006, CASE-ACCOUNT-001

## Tests

TC-SALE-001 … TC-SALE-012, TC-SALE-015, TC-SALE-016

## Implementation

- `packages/domain-kernel/src/sale/post-sale.ts`
- `apps/api/src/modules/sale/post-sale.handler.ts`

## Open questions

- Posting is the moment the receivable arises, not delivery or invoicing
  (ASM-002 — deferred with trigger).
- Whether `sales` may post sales at all, given posting is what creates the
  receivable, is ASM-017.

## Related

- [sale-use-cases.md](sale-use-cases.md) — draft, read, void and replace
- [../04-business-rules/sale-rules.md](../04-business-rules/sale-rules.md)
- [../03-state-machines/sale-state-machine.md](../03-state-machines/sale-state-machine.md)
