# Platform use cases — membership, capabilities, retries, audit

Cross-cutting use cases that belong to no single aggregate. Authentication itself
is [UC-AUTH-001](UC-AUTH-001-authenticate-and-authorize.md).

---

## UC-AUTH-002 — Revoke a workspace membership

**Risk:** P0 · **Status:** implemented · **Command:** `RevokeWorkspaceMembership`

| Field          | Value                                           |
| -------------- | ----------------------------------------------- |
| **Actor**      | Depot owner                                     |
| **Trigger**    | A worker leaves, or a phone is lost             |
| **Permission** | `workspace.manage` — held by `owner` only       |
| **Result DTO** | `WorkspaceMembershipDto` with `isActive: false` |

### The rule that matters

Revocation sets `is_active = false`. It **does not delete the membership row**, and
it does not touch anything that person recorded.

Their sales stand, their payments stand, and every account entry they wrote still
names them (BR-ACCOUNT-004). The audit trail has to keep working after somebody
leaves — that is when it is most needed. Deleting the membership would leave rows
pointing at an actor nobody could explain.

### Inputs and paths

```
payload: { actorId, reason? }   + expectedVersion
```

| Situation                      | Outcome                                                     |
| ------------------------------ | ----------------------------------------------------------- |
| Membership already inactive    | `WORKSPACE_MEMBERSHIP_INACTIVE` — idempotent in effect      |
| Actor is not a member          | `WORKSPACE_ACCESS_DENIED`                                   |
| Caller is not an `owner`       | `PERMISSION_DENIED`                                         |
| Revoking the last active owner | `WORKSPACE_LAST_OWNER` — refused, and this is a real hazard |

The last-owner guard exists because a depot that revokes its only owner has locked
itself out of its own debt book with no self-service remedy.

### Effect on an existing session

Membership is re-checked on **every** request, so a revoked member is refused
immediately on their next call (BR-AUTH-003).

Their bearer token, however, stays cryptographically valid until it expires: there
is no revocation list ([ADR-0010](../09-decisions/ADR-0010-supabase-jwt-verification.md)).
That is survivable precisely because the token alone grants nothing — every
request re-reads the membership. Short token lifetimes are the mitigation, and the
gap is recorded rather than hidden.

### State transition · Account effect · Audit effect

T-MEMBER-001. **No account effect.** One audit record, `membership.revoked`, with
the reason.

### Idempotency · Concurrency · Offline policy

Standard; `expectedVersion` required. Offline is not supported and should not be:
revoking access is urgent, and a command that sits in a queue is not a revocation.

### Capabilities · UI states

`revoke` is a session-level command guarded by `workspace.manage`; the last
active owner cannot be revoked (`WORKSPACE_LAST_OWNER`).
`loading`, `business_rejection`, `permission_denied`, `unknown_network_outcome`.

### Rules · Planned tests

BR-AUTH-003, BR-AUTH-004 · TC-AUTH-013

---

## UC-AUTH-003 — View my capabilities

**Risk:** P1 · **Status:** implemented as part of every DTO · **Read:** `session.me`

| Field          | Value                                                         |
| -------------- | ------------------------------------------------------------- |
| **Actor**      | Any authenticated actor                                       |
| **Trigger**    | The client starts and needs to know which controls to render  |
| **Permission** | None beyond a verified identity and an active membership      |
| **Result DTO** | `SessionDto`: actor, workspace, role, and the permission list |

### Why it exists

A UI has to decide what to show before it has any particular sale or customer in
hand. Without this read, the client would infer the answer from the role name —
growing its own copy of the role table, which then drifts from the server's
([ADR-0011](../09-decisions/ADR-0011-role-permission-mapping.md)).

### Two kinds of capability, and the difference

| Kind                     | Depends on        | Where computed      | Example                   |
| ------------------------ | ----------------- | ------------------- | ------------------------- |
| **Session capability**   | Who is asking     | From the role table | "may I void sales at all" |
| **Aggregate capability** | The thing's state | From the aggregate  | "may I void _this_ sale"  |

`session.me` returns the first. Every DTO carries the second. A client needs both:
the first decides whether a menu item exists, the second whether it is enabled.

### Paths and effects

| Situation                | Outcome                         |
| ------------------------ | ------------------------------- |
| No credential            | `AUTHENTICATION_REQUIRED`       |
| Token invalid            | `AUTHENTICATION_INVALID`        |
| Subject maps to no actor | `ACTOR_NOT_FOUND`               |
| Membership revoked       | `WORKSPACE_MEMBERSHIP_INACTIVE` |

No state transition, no account effect, no audit record.

### Idempotency · Concurrency · Offline policy

Not applicable. Cacheable for the life of a session, but a client that caches it
must still handle `PERMISSION_DENIED` from a command — the role may have changed
since (see UC-AUTH-002).

### UI states

`loading`, `permission_denied`, `unknown_network_outcome`.

### Rules · Tests

BR-AUTH-001, BR-AUTH-003, BR-AUTH-004, BR-AUTH-005, BR-AUTH-006 ·
TC-AUTH-006, TC-AUTH-009

---

## UC-AUTH-004 — List the depots I may work in

**Risk:** P0 · **Status:** implemented · **Read:** `session.workspaces`

| Field          | Value                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| **Actor**      | Any authenticated actor                                                |
| **Trigger**    | Somebody signs in, and the client must ask which depot before anything |
| **Permission** | None beyond a verified identity — see below                            |
| **Result DTO** | `ActorWorkspacesDto`: the actor, and a list of named depots with roles |

### Why it exists

Because the alternative was in the browser. Until this read existed, the depot
list came from `NEXT_PUBLIC_WORKSPACES` — a build-time environment variable naming
ids and labels. That is a claim about who may enter which depot, made by a client,
in a place a client cannot possibly know it: whoever deploys the frontend decides
what appears in the picker, and the server finds out only when the first request
arrives.

It also made a pilot awkward for no good reason. Adding a depot meant a rebuild.

### The question this is asked before

`session.me` answers "what may I do **here**". It cannot be called until "here"
has a value, so something has to answer "where can here be". That is this read,
and it is why it takes a workspace id as input in neither form.

### Paths and effects

| Situation                             | Outcome                                                    |
| ------------------------------------- | ---------------------------------------------------------- |
| No credential                         | `AUTHENTICATION_REQUIRED`                                  |
| Token invalid                         | `AUTHENTICATION_INVALID`                                   |
| Subject maps to no actor              | `ACTOR_NOT_FOUND`                                          |
| Valid identity, no membership at all  | **Empty list, successfully.** Not an error                 |
| Every membership revoked              | Empty list — the same answer, deliberately (BR-AUTH-003)   |
| Member of two depots with two roles   | Two entries, each carrying the role held **in that depot** |
| Client sends an `actorId` in the body | Refused: the input schema is strict and has no such field  |

No state transition, no account effect, no audit record. Reads are not audited
(ASM-022), and this one is the least interesting read there is — it names no
customer and no amount.

### Idempotency · Concurrency · Offline policy

Not applicable. Cacheable for the life of a sign-in, with the same caveat as
`session.me`: a membership may be revoked between the picker and the first
command, and the command is where that is discovered.

### Capabilities · UI states

`loading`, `empty` (signed in, no depot — the state that most needs real copy
rather than a spinner that never resolves), `permission_denied`,
`unknown_network_outcome`.

### Rules · Tests

BR-AUTH-001, BR-AUTH-002, BR-AUTH-003, BR-AUTH-005, BR-AUTH-008, BR-CUSTOMER-002 ·
TC-AUTH-014, TC-AUTH-015, TC-AUTH-016

---

## UC-COMMAND-001 — Handle a retry, a duplicate, or a stale version

**Risk:** P0 · **Status:** implemented · **Applies to:** every command

| Field          | Value                                                            |
| -------------- | ---------------------------------------------------------------- |
| **Actor**      | Any actor, usually without realising it                          |
| **Trigger**    | Signal drops mid-request; a user taps twice; two workers collide |
| **Permission** | Whatever the underlying command requires                         |
| **Result DTO** | The original command's DTO, or a rejection                       |

This use case is the product. A depot worker on 4G at a wholesale market at 3 a.m.
will lose connections mid-command, and the system's value rests on that being
boring.

### The four situations, and their four different answers

| Situation                                           | Answer                                          | Rule           |
| --------------------------------------------------- | ----------------------------------------------- | -------------- |
| Same key, same payload, first attempt completed     | The **stored original result**. No writes.      | BR-COMMAND-001 |
| Same key, same payload, first attempt still running | `COMMAND_IN_PROGRESS` — **retryable**           | BR-COMMAND-001 |
| Same key, **different** payload                     | `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD` | BR-COMMAND-002 |
| Same `commandId`, different key                     | `DUPLICATE_COMMAND` — a client bug              | BR-COMMAND-001 |

Four codes rather than one, because the remedies differ: wait and retry; fix the
payload; fix the client. Collapsing them into "duplicate" would leave a worker
retrying something that will never succeed.

`COMMAND_IN_PROGRESS` is the only code marked retryable, and retryability is a
property of the code rather than of the call site — otherwise two handlers
eventually disagree about whether the same failure is worth retrying.

### The stale version, which is a different problem

A retry asks "did my command happen?". A version conflict says "the world moved
under you". `SALE_VERSION_CONFLICT`, `PAYMENT_VERSION_CONFLICT` and
`CUSTOMER_VERSION_CONFLICT` all carry `expectedVersion` and `actualVersion`, so the
client can say _what_ changed rather than "please try again".

The correct client behaviour is to **reload and show the difference**, never to
retry with a bumped version. Retrying with `actualVersion` would apply an intention
formed against data the user never saw.

### The unknown outcome

A request that times out has an outcome the client cannot observe. The only safe
move is to resubmit **the identical command with the identical key**, which either
returns the original result or completes it. This is why `idempotencyKey` is
mandatory rather than optional, and why a refused command must not consume one
(BR-COMMAND-006).

### Effects

No state transition of its own. A replay writes nothing at all — not even an audit
record, because nothing happened the second time.

### Offline policy

This is the mechanism that makes offline capture safe. Commands are queued on the
device with locally generated ids and submitted in order when a connection
returns; duplicates from an over-eager retry loop are absorbed.

### UI states

`duplicate_safe_retry`, `unknown_network_outcome`, `stale_version`,
`business_rejection`.

### Rules · Cases · Tests

BR-COMMAND-001 … BR-COMMAND-006, BR-SALE-006, BR-PAYMENT-007 ·
CASE-SALE-005, CASE-PAYMENT-006, CASE-PAYMENT-007, CASE-PAYMENT-011 ·
TC-COMMAND-001 … TC-COMMAND-006

### Implementation

- `apps/api/src/modules/shared/command-pipeline.ts`

---

## UC-AUDIT-001 — Trace a transaction and its corrections

**Risk:** P1 · **Status:** implemented ·
**Read:** `audit.list`

| Field          | Value                                                     |
| -------------- | --------------------------------------------------------- |
| **Actor**      | Depot owner or accountant                                 |
| **Trigger**    | "Why is this number what it is?" — a dispute, or a review |
| **Permission** | `audit.read` — held by `owner`, `accountant`              |
| **Result DTO** | A page of `AuditRecordDto`                                |

### What it answers

Given a sale, a payment, or a customer, produce the sequence of business actions
that reached the current state — who did what, when it happened, when it was
recorded, and why.

The worked example is the one from the casebook: a sale posted for the wrong
amount, voided, and replaced. The audit list shows `sale.posted`, `sale.voided`
with its reason code and explanation, `sale.draft_created` for the replacement, and
`sale.posted` again — four actions, four actors, four timestamps. The account
timeline (UC-ACCOUNT-001) shows the three matching money movements. Together they
answer the question completely.

### Inputs and paths

```
{ workspaceId, aggregateType?, aggregateId?, actorId?, from?, to?, cursor?, limit? }
```

| Situation                      | Outcome                   |
| ------------------------------ | ------------------------- |
| Role lacks `audit.read`        | `PERMISSION_DENIED`       |
| Aggregate in another workspace | Empty page — never a leak |
| No records                     | Empty page, not an error  |

### What audit is not

It is **not** row-level change capture. `before` and `after` are short semantic
summaries — "status draft → posted, total 1.200.000" — never a dump of the
aggregate. Dumping whole rows would copy customer data into a table with a
different retention policy, and would bury the business action under diff noise.

It is also not the money record. The account ledger is (UC-ACCOUNT-001). Audit
explains _intent and authorship_; the ledger holds _amounts_. Two records, two
questions, deliberately not merged.

### Effects · Idempotency · Concurrency · Offline policy

None; not applicable; not applicable; no offline surface.

### UI states

`loading`, `empty`, `permission_denied`, `unknown_network_outcome`.

### Rules · Cases · Planned tests

BR-ACCOUNT-004, BR-AUTH-001, BR-AUTH-004, BR-COMMAND-005 · CASE-SALE-007 ·
TC-AUDIT-001, TC-AUDIT-002

---

## UC-PAYMENT-003 — View a payment

**Risk:** P2 · **Status:** implemented · **Read:** `payment.get`, `payment.list`

| Field          | Value                                                   |
| -------------- | ------------------------------------------------------- |
| **Actor**      | Any active member holding `payment.read`                |
| **Trigger**    | Checking what came in today, or inspecting a reversal   |
| **Permission** | `payment.read` — held by `owner`, `accountant`, `sales` |
| **Result DTO** | `PaymentDto`, or a page of them                         |

A payment DTO carries `amount`, `reversedAmount`, `remainingReversibleAmount`,
its derived `status`, and its `reverse` capability. The remaining amount is
computed server-side rather than left as `amount − reversedAmount` for the client,
because a client that gets that subtraction wrong offers to reverse money that is
not there (BR-PAYMENT-003).

| Situation                    | Outcome             |
| ---------------------------- | ------------------- |
| Payment in another workspace | `PAYMENT_NOT_FOUND` |
| Role lacks `payment.read`    | `PERMISSION_DENIED` |
| No payments                  | Empty page          |

No state transition, no account effect, no audit record. Cacheable with its fetch
time.

### UI states

`loading`, `empty`, `permission_denied`, `unknown_network_outcome`,
`payment_recorded`, `payment_partially_reversed`, `payment_reversed`.

### Rules · Planned tests

BR-AUTH-001, BR-AUTH-004, BR-PAYMENT-008, BR-CUSTOMER-002 ·
TC-PAYMENT-013, TC-PAYMENT-014

## Related

- [UC-AUTH-001-authenticate-and-authorize.md](UC-AUTH-001-authenticate-and-authorize.md)
- [../04-business-rules/authorization-rules.md](../04-business-rules/authorization-rules.md)
- [../06-api-contracts/command-contracts.md](../06-api-contracts/command-contracts.md)
- [use-case-catalog.md](use-case-catalog.md)
