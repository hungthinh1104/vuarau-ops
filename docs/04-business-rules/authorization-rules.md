# Authorization business rules

Who the caller is, and what their role lets them do. Added by Milestone 1, which
closed ASM-007.

Before Milestone 1 the API took `actorId` from the request body and any workspace
member could move any customer's balance. Both are now false.

---

### BR-AUTH-001 — Every command and every query requires a verified identity

**Risk:** P0 · **Codes:** `AUTHENTICATION_REQUIRED`, `AUTHENTICATION_INVALID` · **Tests:** TC-AUTH-001, TC-AUTH-010, TC-AUTH-011

A bearer token is verified at the transport boundary before any procedure runs:
signature, `exp`, `iss`, and `aud`, with the algorithm pinned to what the
configured key can produce ([ADR-0010](../09-decisions/ADR-0010-supabase-jwt-verification.md)).

Reads are included. A depot's debt book has no public surface, and until this
milestone `debt.summary` and `debt.ledger` would answer for **any** workspace id
handed to them — workspace isolation had been enforced on the write path only.

`AUTHENTICATION_INVALID` deliberately does not say _why_ a token failed. Expired,
forged, and wrong-audience all produce the same message; anything else is an
oracle.

---

### BR-AUTH-002 — A command may only act as the authenticated actor

**Risk:** P0 · **Code:** `ACTOR_IMPERSONATION_DENIED` · **Tests:** TC-AUTH-002, TC-CUSTOMER-003

`command.actorId` is **checked** against the principal, never trusted as its
source. A mismatch is refused before anything is read or written.

Checked **first**, before membership and permission. Two actors who both hold
`debt.adjust` would otherwise be interchangeable, and the ledger's attribution —
the thing that makes a disputed balance answerable — would name the wrong person.

The field is kept in the envelope rather than dropped: a client that sends the
wrong one is telling us something is broken, and a refusal is more useful than a
silent substitution.

---

### BR-AUTH-003 — An inactive membership grants nothing

**Risk:** P0 · **Code:** `WORKSPACE_MEMBERSHIP_INACTIVE` · **Tests:** TC-AUTH-003

`workspace_memberships.is_active = false` revokes access while preserving the
record that the person was once a member — the audit trail must still explain
entries they wrote.

A separate code from `WORKSPACE_ACCESS_DENIED` on purpose. "Your access was
turned off" and "you were never a member" send an operator to different places.
The repository therefore returns inactive memberships rather than filtering them
out, so the two remain distinguishable.

---

### BR-AUTH-004 — Every command requires a permission its role carries

**Risk:** P0 · **Code:** `PERMISSION_DENIED` · **Tests:** TC-AUTH-004, TC-AUTH-009

Each command declares one permission; the pipeline checks it against the role on
the caller's membership, using the static table in
`packages/domain-contracts/src/shared/authorization.ts`
([ADR-0011](../09-decisions/ADR-0011-role-permission-mapping.md)).

| Command / read                        | Permission                                                 | Roles                                         | Status      |
| ------------------------------------- | ---------------------------------------------------------- | --------------------------------------------- | ----------- |
| `CreateCustomer`                      | `customer.create`                                          | owner, sales                                  | implemented |
| `UpdateCustomer`                      | `customer.update`                                          | owner, sales                                  | implemented |
| `DeactivateCustomer`                  | `customer.deactivate`                                      | **owner**                                     | implemented |
| `customer.search`, `customer.get`     | `customer.read`                                            | all roles                                     | implemented |
| `CreateSaleDraft`                     | `sale.create`; replacement needs `sale.void` by void actor | owner, sales; owner/accountant for correction | implemented |
| `UpdateSaleDraft`, `DiscardSaleDraft` | `sale.create`                                              | owner, sales                                  | implemented |
| `PostSale`                            | `sale.post`; replacement needs `sale.void` by void actor   | owner, sales; owner/accountant for correction | implemented |
| `VoidSale`                            | `sale.void`                                                | **owner, accountant**                         | implemented |
| `sale.get`, `sale.list`               | `sale.read`                                                | all roles                                     | implemented |
| `RecordCustomerPayment`               | `payment.record`                                           | owner, accountant, sales                      | implemented |
| `ReverseCustomerPayment`              | `payment.reverse`                                          | owner, accountant                             | implemented |
| `payment.get`, `payment.list`         | `payment.read`                                             | owner, accountant, sales                      | implemented |
| `AdjustCustomerDebt`                  | `debt.adjust`                                              | **owner, accountant**                         | implemented |
| `account.balance`, `account.timeline` | `debt.read`                                                | owner, accountant, sales                      | implemented |
| `audit.timeline`                      | `audit.read`                                               | **owner, accountant**                         | implemented |
| `RevokeWorkspaceMembership`           | `workspace.manage`                                         | **owner**                                     | implemented |
| `session.me`                          | — (identity only)                                          | all roles                                     | implemented |
| `session.workspaces`                  | — (identity only)                                          | all roles                                     | implemented |

The refusal names the permission and the role, so the answer to "why can't I do
this" does not require reading the source.

### Why `sale.void` is not `sale.post`

Posting creates a receivable; voiding removes one. They are opposite directions and
they get different permissions.

`sales` may post — that is the job. `sales` may **not** void, because a worker who
can both create and erase a sale can make a load disappear from the record
entirely, and no reviewer looking at the balance would see anything missing. Void
sits with `owner` and `accountant`, next to `debt.adjust`, because both are ways of
moving money without a new trade happening.

This is a default, not a settled policy — see ASM-017.

---

### BR-AUTH-005 — A verified subject resolves to exactly one local actor

**Risk:** P1 · **Code:** `ACTOR_NOT_FOUND` · **Tests:** TC-AUTH-008

`actors.supabase_user_id` is unique. A valid token whose subject matches no actor
is refused — a real user who has not been provisioned in this depot is not an
error in their credential, and the operator's remedy is to create the actor.

The column is nullable: seeds and future importers need an actor to attribute
rows to, and such an actor simply cannot authenticate. That is the correct
outcome, not a gap.

---

### BR-AUTH-006 — Debt adjustment is restricted to owner and accountant

**Risk:** P0 · **Code:** `PERMISSION_DENIED` · **Tests:** TC-AUTH-005, TC-AUTH-006

`AdjustCustomerDebt` is the only command that moves a balance with no underlying
business document. It is the most abusable operation in the system, and it is now
the most restricted.

`CustomerAccountBalanceDto.capabilities.adjust` reports the same answer, computed
by the same `roleHasPermission` call the guard uses — so a greyed-out button and a
server refusal cannot disagree ([ADR-0003](../09-decisions/ADR-0003-backend-owns-business-rules.md)).

Since the sale-void path landed, `AdjustCustomerDebt` is also **no longer the way
to correct a wrong sale** (BR-ACCOUNT-010). That narrows what it is for, which
narrows what an abuse of it could plausibly be explained as.

---

### BR-AUTH-007 — A workspace always keeps at least one active owner

**Risk:** P1 · **Code:** `WORKSPACE_LAST_OWNER` · **Tests:** TC-AUTH-013

`RevokeMembership` refuses when the target is the only remaining active `owner`.

A depot that revokes its last owner has locked itself out of its own account book,
and there is no self-service remedy: every command that could restore access needs
`workspace.manage`, which only an owner holds. The guard costs one query; the
failure costs a support intervention against a production database.

The count is taken **under a row lock**, not as a plain `SELECT count(*)`. Two
owners revoking each other at the same moment would otherwise both read two and
both proceed. A version column on the membership row would not have caught that —
they are updating different rows — which is why revocation carries no
`expectedVersion` and this lock instead.

---

### BR-AUTH-008 — Workspace discovery answers from the token and takes no input

**Risk:** P0 · **Code:** — · **Tests:** TC-AUTH-014, TC-AUTH-015, TC-AUTH-016

`session.workspaces` returns the depots the **authenticated actor** may act in:
workspace id, display name, role, and the permissions that role carries there. It
is the only read in the system that is not scoped to one workspace, and it is
allowed to be for a reason that also makes it safe.

**Its input is empty.** Not "an actor id that is checked against the token" — no
actor id at all. The list is derived from `ctx.principal.actorId`, which the
transport resolved from a verified subject (BR-AUTH-005) and which no request body
can reach. There is nothing to tamper with, which is a stronger property than a
check: a check can be forgotten by the next procedure, and an absent field cannot.

The input schema is **strict**, so a client that sends `{ actorId }` is refused
rather than quietly given its own list. A silently dropped field is a field
somebody eventually believes in.

**Only active memberships appear.** A revoked worker gets an empty list — exactly
what a stranger with a valid Supabase account gets — rather than a depot they can
select and then be refused at (BR-AUTH-003). This is the opposite of
`findMembership`, which deliberately returns inactive rows so a refusal can say
_which_ refusal it is; the two callers need different answers and the repository
gives each the one it needs.

**No permission is required, and none could be.** `runQuery` demands a workspace
and a permission held within it; this is the question asked before a workspace is
known. Requiring a permission to learn which workspaces exist for you would be
circular in the same way requiring one to read your own permissions would
(UC-AUTH-003).

An empty list is a **successful** answer, not a rejection. "You are signed in and
belong to no depot" is a real state — the first minute of a new person's account —
and turning it into an error would make the client branch on an exception for
something ordinary.

Why this rule is P0 despite refusing nothing: the query spans workspaces. A
missing `actor_id` predicate returns every depot in the database, and every
in-memory test would still pass because the in-memory filter is different code.
TC-AUTH-016 asserts it against real SQL for that reason.

---

### BR-AUTH-009 — Membership management is owner-only and preserves attribution

**Risk:** P0 · **Codes:** `WORKSPACE_LAST_OWNER`,
`WORKSPACE_MEMBER_SELF_ROLE_CHANGE_DENIED` · **Tests:** TC-AUTH-013,
TC-E2E-024

Only `workspace.manage` may add, change, revoke or reactivate a membership. Role
changes use the stored membership as server authority and reject stale expected
roles. An owner cannot demote themselves, and concurrent operations cannot remove
the last active owner.

Revocation and reactivation update the membership rather than deleting it. Sales,
payments, adjustments, ledger entries and audits continue to name the same actor.

---

## What is still open

| Question                                                      | State                                           | Reference |
| ------------------------------------------------------------- | ----------------------------------------------- | --------- |
| Is the role→permission mapping right?                         | Least-privilege defaults, unconfirmed           | ASM-017   |
| May `sales` post sales, given posting creates the receivable? | Defaulted to yes                                | ASM-017   |
| Existing memberships were backfilled as `owner`               | Deliberate, needs an operational pass           | ASM-018   |
| Row-level security in Postgres                                | Not implemented; isolation is application-layer | ASM-009   |
| Do large adjustments need a second approver?                  | Undecided                                       | ASM-020   |

## Related

- [error-code-catalog.md](error-code-catalog.md)
- [../02-use-cases/UC-AUTH-001-authenticate-and-authorize.md](../02-use-cases/UC-AUTH-001-authenticate-and-authorize.md), [../02-use-cases/platform-use-cases.md](../02-use-cases/platform-use-cases.md)
- [../06-api-contracts/capabilities.md](../06-api-contracts/capabilities.md)
