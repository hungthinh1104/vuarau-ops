# Customer account use cases — balance, timeline, rebuild

Adjusting an account has its own document,
[UC-ACCOUNT-002](UC-ACCOUNT-002-adjust-customer-account.md), because it is the
sharpest command in the system. This file covers reading an account and repairing
its projection.

---

## UC-ACCOUNT-001 — View the account balance and timeline

**Risk:** P0 · **Status:** implemented ·
**Reads:** `account.balance`, `account.timeline`

| Field          | Value                                                                |
| -------------- | -------------------------------------------------------------------- |
| **Actor**      | Any active member holding `debt.read`                                |
| **Trigger**    | "Anh Tuấn nợ bao nhiêu?" — the question the product exists to answer |
| **Permission** | `debt.read` — held by `owner`, `accountant`, `sales`                 |
| **Result DTO** | `CustomerAccountBalanceDto`; a page of `AccountTimelineEntryDto`     |

### Preconditions and inputs

```
account.balance  { workspaceId, customerId }
account.timeline { workspaceId, customerId, from?, to?, cursor?, limit? }
```

Both are authorized exactly like commands (BR-AUTH-001). Reads were the gap in the
original design: before Milestone 1 these two procedures answered for **any**
workspace id handed to them, because isolation had been enforced on the write path
only.

### Happy path — balance

Authorize `debt.read`, read the projection, classify it, attach capabilities.

The value returned is the **projection**, not a live `SUM`. It is maintained in the
same transaction as the entry that moved it, so it is never behind (BR-ACCOUNT-001)
— and it is rebuildable from the entries if it ever were (BR-ACCOUNT-006). Reading
the projection makes the common question cheap; the rebuild makes it trustworthy.

### Happy path — timeline

Authorize, page the customer's entries by `transactionTime` descending, and return
a running balance alongside each entry so the reader can see how the total was
reached rather than being asked to add it up.

Each entry carries its source: which sale, which payment, which void, which
adjustment — and for an adjustment, its reason code and text (BR-ACCOUNT-003).
This is the recovery surface: when a customer disputes a total, this list is the
answer, and every line in it names an actor and a command (BR-ACCOUNT-004).

The timeline shows **every** entry, including compensations. A voided sale appears
as two lines, `+total` then `−total`, not as an absence. Hiding either would make
the arithmetic unexplainable and the record dishonest.

### Alternative and rejection paths

| Situation                        | Outcome                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| No credential                    | `AUTHENTICATION_REQUIRED`                                          |
| Token expired or forged          | `AUTHENTICATION_INVALID` — never says which                        |
| Member of another workspace only | `WORKSPACE_ACCESS_DENIED`                                          |
| Membership revoked               | `WORKSPACE_MEMBERSHIP_INACTIVE`                                    |
| Role lacks `debt.read`           | `PERMISSION_DENIED`                                                |
| Customer has no entries          | Balance of 0, `classification: settled`, empty timeline — no error |
| Customer not found               | `CUSTOMER_NOT_FOUND`                                               |

An unknown customer and an empty account are different answers, deliberately.

### State transition · Account effect · Audit effect

None, none, none.

### Idempotency · Concurrency

Not applicable. The balance may move between the read and the next command; that
is why capabilities are advisory and every command re-checks
([capabilities](../06-api-contracts/capabilities.md)).

### Offline policy

Cacheable, and must be displayed with its fetch time. This is the read where a
stale number does real damage: a worker shown yesterday's balance as today's will
collect the wrong amount from a customer who then disputes it.

### Capabilities

`CustomerAccountBalanceDto.capabilities.adjust` — `allowed` only for `owner` and
`accountant` (BR-AUTH-006), computed by the same `roleHasPermission` call the
guard uses.

### UI states

`loading`, `empty`, `permission_denied`, `unknown_network_outcome`,
`balance_receivable`, `balance_settled`, `balance_customer_credit`,
`sale_voided` (a compensating pair in the timeline),
`payment_reversed`, `payment_partially_reversed`.

### Rules · Cases · Tests

BR-AUTH-001, BR-AUTH-004, BR-AUTH-006, BR-ACCOUNT-001, BR-ACCOUNT-004,
BR-ACCOUNT-009, BR-CUSTOMER-002 · CASE-ACCOUNT-008 ·
TC-ACCOUNT-001, TC-AUTH-006, TC-ACCOUNT-010, TC-READ-005

### Implementation

- `apps/api/src/modules/account/account.queries.ts`

---

## UC-ACCOUNT-003 — Reconcile and rebuild the account balance

**Risk:** P0 · **Status:** implemented · **Read:** `account.reconciliation` ·
**Command:** `RebuildAccountProjection`

| Field          | Value                                                    |
| -------------- | -------------------------------------------------------- |
| **Actor**      | Any account reader; owner/accountant for rebuild         |
| **Trigger**    | Explain a balance; investigate projection drift          |
| **Permission** | `debt.adjust` — the same bar as moving a balance by hand |
| **Result DTO** | Typed reconciliation plus deterministic evidence         |

### Why this exists

The balance is a **cache**. The entries are the truth (ADR-0004). That is only a
useful claim if the cache can actually be thrown away and rebuilt, so this is the
procedure that makes the claim testable — and TC-ACCOUNT-009 asserts the rebuild
equals the incremental value after a sale, a payment, and a void.

### Happy path

1. Read every account entry and its canonical business source in this workspace.
2. Compare the full ledger sum, count and latest transaction with the projection.
3. Return `consistent`, `inconsistent`, `not_found`, or `integrity_failure`.
4. Only projection-only drift may be rebuilt; return the post-rebuild result.

### Alternative and rejection paths

| Situation                               | Outcome                                                        |
| --------------------------------------- | -------------------------------------------------------------- |
| Projection-only drift                   | Rebuild is allowed and before/after is audited                 |
| Missing/malformed source or ledger data | `ACCOUNT_RECONCILIATION_INTEGRITY_FAILURE`; rebuild is refused |
| Diagnostics are not projection-only     | `ACCOUNT_RECONCILIATION_REBUILD_UNSAFE`                        |
| Customer has no entries                 | Balance 0, `settled` — a legitimate result                     |
| Caller lacks `debt.adjust`              | Read allowed; rebuild capability denied and command refused    |

A silent rebuild that quietly changes a number is the wrong behaviour. If a
projection had drifted, somebody needs to know it drifted — the drift is evidence
of a bug, and repairing the symptom without recording it loses that evidence.

### State transition · Account effect

None, and **none**. This is the subtle point: a rebuild does not append an entry.
It recomputes a cache from entries that already existed. Nothing about what the
customer owes has changed; only the cached copy of it has been corrected.

### Audit effect

One record, `account.projection_rebuilt`, carrying the before and after balances. Not a money
movement, but an operator action against financial data, and those are audited.

### Idempotency · Concurrency

Naturally idempotent: rebuilding twice gives the same answer. Runs inside a
transaction with the entries read consistently, so a concurrent posting is either
fully included or fully excluded, never half.

### Offline policy

Not queued offline. A dropped response is resent with the same command identity.

### Capabilities · UI states

The reconciliation result carries a server-authored rebuild capability. States:
`loading`, `consistent`, `inconsistent`, `integrity_failure`,
`permission_denied`, and `unknown_network_outcome`.

### Rules · Cases · Tests

BR-ACCOUNT-001, BR-ACCOUNT-002, BR-ACCOUNT-005, BR-ACCOUNT-006 ·
CASE-ACCOUNT-007 · TC-ACCOUNT-002, TC-ACCOUNT-009

### Implementation

- `apps/api/src/modules/account/reconciliation.ts`
- `apps/api/src/modules/account/rebuild-account-projection.handler.ts`

## Related

- [UC-ACCOUNT-002-adjust-customer-account.md](UC-ACCOUNT-002-adjust-customer-account.md)
- [../04-business-rules/customer-account-rules.md](../04-business-rules/customer-account-rules.md)
- [../07-data/ledger-model.md](../07-data/ledger-model.md)
- [use-case-catalog.md](use-case-catalog.md)
