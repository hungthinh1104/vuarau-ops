# Sale use cases — draft, read, void, replace

Posting has its own document, [UC-SALE-002](UC-SALE-002-post-sale.md), because it
is the P0 money event. This file holds the rest of the sale lifecycle.

Every use case here uses the same template. **Status** says whether the backend
implements it today, and every use case in this file is implemented; each carries a
real capability computed from the same rule the command enforces
([capabilities](../06-api-contracts/capabilities.md)).

---

## UC-SALE-001 — Create, edit and discard a sale draft

**Risk:** P1 · **Status:** implemented ·
**Commands:** `CreateSaleDraft`, `UpdateSaleDraft`, `DiscardSaleDraft`

| Field          | Value                                                            |
| -------------- | ---------------------------------------------------------------- |
| **Actor**      | Depot owner or sales worker                                      |
| **Trigger**    | A buyer starts picking a load; the worker begins writing it down |
| **Permission** | `sale.create` — held by `owner`, `sales`                         |
| **Result DTO** | `SaleDto` with `status: draft`, `financialState: null`           |

### Preconditions

Customer exists and is active in this workspace. Client has generated `saleId` and
one `lineId` per line.

### Inputs

```
CreateSaleDraft  payload: { saleId, customerId, currency, lines[], note?, dueAt?, replacesSaleId? }
EditSaleDraft    payload: { saleId, lines[], note?, dueAt? }        + expectedVersion
DiscardSaleDraft payload: { saleId, reason? }                        + expectedVersion
```

`lines[]` may be empty on creation — the worker is still typing, and that is not an
error yet. `dueAt` is optional and defaults to null (BR-SALE-017). `replacesSaleId`
is set only when this draft corrects a voided sale (BR-SALE-016).

### Happy path

1. Authenticate, authorize `sale.create`, claim the idempotency key.
2. Validate the customer exists in this workspace.
3. If `replacesSaleId` is present, validate that sale exists in this workspace.
4. Compute each `lineTotal` and the total (BR-SALE-001, BR-SALE-004); snapshot
   product name, quantity, unit and unit price on each line (BR-SALE-011).
5. Store as `draft`, `version = 1`, `transactionTime = occurredAt`,
   `recordedAt = now`.

### Alternative and rejection paths

| Situation                           | Outcome                                        |
| ----------------------------------- | ---------------------------------------------- |
| Customer not in this workspace      | `CUSTOMER_NOT_FOUND`                           |
| `replacesSaleId` names no sale      | `SALE_NOT_FOUND` (BR-SALE-016)                 |
| Line invalid                        | `SALE_LINE_INVALID` with `lineIndex`, `lineId` |
| Line currency ≠ sale currency       | `SALE_CURRENCY_MISMATCH`                       |
| Editing or discarding a posted sale | `SALE_ALREADY_POSTED` (BR-SALE-018)            |
| Editing with a stale version        | `SALE_VERSION_CONFLICT`                        |
| Retry of the same create            | The original `SaleDto`; no second draft        |

### State transition

T-SALE-001 (`∅ → draft`), T-SALE-003 (`draft → draft`), T-SALE-004
(`draft → discarded`).

### Account effect

**None, in all three cases** (BR-SALE-010). This is the point of the draft, and it
is asserted directly by TC-SALE-014 rather than inferred from the absence of a
call.

### Audit effect

One record per command: `sale.draft_created`, `sale.draft_edited`,
`sale.discarded`. A draft is audited even though it moves no money, because "who
entered this and when" is the first question asked about a disputed sale.

### Idempotency

Standard. The client-generated `saleId` means a replayed create cannot produce a
second draft even if the receipt were lost — the primary key refuses it.

### Concurrency

Create takes no `expectedVersion` — there is nothing yet to conflict with. Edit and
discard require it: two workers editing one draft on two phones is the ordinary
case in a depot, not an edge case.

### Offline policy

Fully supported, and the most common offline path there is. Drafts are typed at the
loading bay with no signal. Ids, `commandId`, `idempotencyKey` and `occurredAt` are
all generated on the device.

A draft created offline and edited offline several times produces several commands;
they apply in order, and any that arrives against a version that has since moved is
refused rather than merged. There is no automatic merge, deliberately: silently
combining two workers' line edits would produce a total neither of them typed.

### Capabilities

`edit`, `discard` and `post` all return real answers. `edit` and `discard` always
agree, because both ask whether this is still a live draft.

### UI states

`loading`, `empty` (no lines yet — a legitimate state, not an error),
`validation_error`, `permission_denied`, `stale_version`, `duplicate_safe_retry`,
`unknown_network_outcome`.

### Rules · Cases · Tests

BR-SALE-001, BR-SALE-003, BR-SALE-004, BR-SALE-009, BR-SALE-010, BR-SALE-011,
BR-SALE-016, BR-SALE-017, BR-SALE-018 · CASE-SALE-001, CASE-SALE-009 ·
TC-SALE-001, TC-SALE-002, TC-SALE-014, TC-SALE-019, TC-SALE-020

---

## UC-SALE-003 — View and list sales

**Risk:** P2 · **Status:** implemented · **Reads:** `sale.get`, `sale.list`

| Field          | Value                                          |
| -------------- | ---------------------------------------------- |
| **Actor**      | Any active member of the workspace             |
| **Trigger**    | Opening a sale, or reviewing the day's takings |
| **Permission** | `sale.read` — held by every role               |
| **Result DTO** | `SaleDto`, or a page of `SaleSummaryDto`       |

### Preconditions and inputs

```
sale.get   { workspaceId, saleId }
sale.list  { workspaceId, customerId?, status?, financialState?, from?, to?, cursor?, limit? }
```

Reads are authorized exactly like commands (BR-AUTH-001). A depot's sales book has
no public surface, and a read that skipped authorization would leak another depot's
trade — this was a real hole before Milestone 1.

### Happy path

Authorize `sale.read` for this workspace, load, map to DTO with server-computed
`financialState`, `dueState` and `capabilities`.

### Alternative and rejection paths

| Situation                 | Outcome                                                |
| ------------------------- | ------------------------------------------------------ |
| Sale in another workspace | `SALE_NOT_FOUND` — indistinguishable from not existing |
| No credential             | `AUTHENTICATION_REQUIRED`                              |
| Membership revoked        | `WORKSPACE_MEMBERSHIP_INACTIVE`                        |
| No sales match            | Empty page, not an error                               |

### State transition · Account effect · Audit effect

None, none, and none. Reads are not audited in this phase: the volume would swamp
the table that exists to explain money movements. Who read what is a separate
concern with a separate retention policy, and is recorded as an open question in
the [decision backlog](../09-decisions/decision-backlog.md).

### Idempotency · Concurrency

Not applicable. A read is a snapshot; the `capabilities` it carries may already be
stale by the time the user taps, which is why the command re-checks everything
([capabilities](../06-api-contracts/capabilities.md)).

### Offline policy

Reads are cacheable client-side and must be marked with the time they were fetched.
A cached balance shown without its age is how a worker collects the wrong amount.

### Capabilities · UI states

Each returned sale carries `post` and `void`.
`loading`, `empty`, `permission_denied`, `unknown_network_outcome`,
`sale_posted`, `sale_voided`.

### Rules · Cases · Tests

BR-AUTH-001, BR-AUTH-004, BR-CUSTOMER-002, BR-SALE-017, BR-READ-001,
BR-READ-002, BR-READ-003 · CASE-READ-001 · TC-READ-001, TC-READ-004, TC-READ-009

---

## UC-SALE-004 — Void a sale, and post a replacement

**Risk:** P0 · **Status:** implemented · **Command:** `VoidSale`

| Field          | Value                                                                 |
| -------------- | --------------------------------------------------------------------- |
| **Actor**      | Depot owner or accountant                                             |
| **Trigger**    | A posted sale is wrong: wrong amount, wrong customer, goods came back |
| **Permission** | `sale.void` — held by `owner`, `accountant`                           |
| **Result DTO** | `SaleDto` with `financialState: voided`, plus the resulting balance   |

Voiding is how a wrong sale is corrected (approved decision 7). It is **not**
`AdjustCustomerDebt`; that command exists for movements with no underlying
document, and using it here would leave the wrong sale standing while quietly
patching the balance (BR-ACCOUNT-010).

### Preconditions

The sale is `posted` and not already voided. The caller has read it and knows what
it says.

### Inputs

```
payload: { saleVoidId, saleId, reasonCode, reason, evidenceReferences? }
```

No `expectedVersion`: a posted sale's version never moves, so there is no lost
update to guard against, and asking for a token the caller cannot affect would be
theatre ([state catalog](../03-state-machines/state-catalog.md)).

No amount either. The compensation is computed from the stored posted total, so a
void cannot be used to move an arbitrary sum (BR-SALE-012).

`evidenceReferences` is optional source-linked field evidence (for example a paper
document, photo or message reference). It is returned with the Sale/void record but
does not change the compensation or create another business effect.

### Happy path

1. Authenticate, authorize `sale.void`, claim the idempotency key.
2. Load the sale `FOR UPDATE`, which serialises concurrent attempts.
3. Check status is `posted` (BR-SALE-015) and no void record exists
   (BR-SALE-013).
4. Check `reasonCode` is in the enum and `reason` is non-blank (BR-SALE-014).
5. Write one immutable `sale_voids` row.
6. Append one account entry of `−sale.totalAmount`, `sourceType = sale_void`,
   `sourceId = saleVoidId` (BR-SALE-012).
7. Update the balance projection; write the audit record; complete the receipt.
   All in the one transaction.

The original sale row and its posting entry are **not touched** — that is the
whole design (BR-SALE-008, BR-ACCOUNT-005).

### Replacement

A replacement is a separate, ordinary act: `CreateSaleDraft` with
`replacesSaleId = <the voided sale>`, then `PostSale`. It is optional. A load that
came back is voided and never replaced; a load priced wrongly is voided and
replaced (BR-SALE-016).

After both, the account reads `+wrong`, `−wrong`, `+right`. Every entry stands, the
arithmetic is right, and the history explains itself.

### Alternative and rejection paths

| Situation                      | Outcome                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| Sale not in this workspace     | `SALE_NOT_FOUND`                                                 |
| Sale is a draft                | `SALE_NOT_POSTED` (BR-SALE-015) — discard it instead             |
| Already voided                 | `SALE_ALREADY_VOIDED` (BR-SALE-013)                              |
| Two voids race                 | One succeeds; the other gets `SALE_ALREADY_VOIDED`               |
| Missing or blank `reason`      | `SALE_VOID_REASON_REQUIRED` (BR-SALE-014)                        |
| `reasonCode` not in the enum   | `INVALID_COMMAND_PAYLOAD`                                        |
| Caller is `sales`              | `PERMISSION_DENIED` — voiding moves money back                   |
| Retry after a timeout          | The original result; balance unchanged (BR-COMMAND-001)          |
| Customer already paid the sale | Accepted. The balance goes to `customer_credit` (BR-ACCOUNT-007) |

That last row is the interesting one. Voiding a paid sale does not fail and does
not touch the payment: the payment was real money that really arrived. The result
is a credit the customer can spend on the next load, which is exactly what a depot
would do with the cash in practice.

### State transition

T-VOID-001. The `sales` row does not change; the sale's derived
`financialState` becomes `voided`.

### Account effect

One entry, `−total`. Posting and void now sum to zero for this sale.

### Audit effect

One record: `action = sale.voided`, `aggregateType = sale`, carrying the reason
code and the explanation. This is the record somebody reads six months later when
a customer asks why an amount disappeared.

### Idempotency

Standard, plus `UNIQUE (sale_id)` on `sale_voids` as the structural backstop
(BR-SALE-013). Three independent guards, because a double void credits a customer
twice for one mistake.

### Concurrency

Row lock on the sale for the transaction; the unique index catches anything the
lock somehow does not.

### Offline policy

Supported but **discouraged**. A void is a decision taken after looking at a
posted sale, and the useful version of that decision is made with the current
balance in view. The command works offline; the guidance is that the UI should not
encourage it.

### Capabilities

`SaleDto.capabilities.void`: `allowed` when posted and not yet voided; otherwise
`SALE_ALREADY_VOIDED`, `SALE_NOT_POSTED`, or `PERMISSION_DENIED`.

### UI states

`loading`, `validation_error`, `business_rejection`, `permission_denied`,
`duplicate_safe_retry`, `unknown_network_outcome`, `sale_voided`,
`balance_customer_credit`.

### Rules · Cases · Tests

BR-SALE-008, BR-SALE-012 … BR-SALE-016, BR-ACCOUNT-002, BR-ACCOUNT-005,
BR-ACCOUNT-010, BR-COMMAND-001, BR-COMMAND-005 · CASE-SALE-007, CASE-SALE-008,
CASE-SALE-010, CASE-SALE-011 · TC-SALE-021 … TC-SALE-027

### Implementation

- `packages/domain-kernel/src/sale/void-sale.ts`
- `apps/api/src/modules/sale/void-sale.handler.ts`

## Related

- [UC-SALE-002-post-sale.md](UC-SALE-002-post-sale.md)
- [../04-business-rules/sale-rules.md](../04-business-rules/sale-rules.md)
- [../05-casebook/sale-cases.md](../05-casebook/sale-cases.md)
- [use-case-catalog.md](use-case-catalog.md)
