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

| Command / read                | Permission        | Roles                    |
| ----------------------------- | ----------------- | ------------------------ |
| `CreateCustomer`              | `customer.create` | owner, sales             |
| `CreateOrder`                 | `order.create`    | owner, sales             |
| `ConfirmOrder`                | `order.confirm`   | owner, sales             |
| `RecordCustomerPayment`       | `payment.record`  | owner, accountant, sales |
| `ReverseCustomerPayment`      | `payment.reverse` | owner, accountant        |
| `AdjustCustomerDebt`          | `debt.adjust`     | **owner, accountant**    |
| `debt.summary`, `debt.ledger` | `debt.read`       | owner, accountant, sales |
| order reads                   | `order.read`      | all roles                |

The refusal names the permission and the role, so the answer to "why can't I do
this" does not require reading the source.

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

`CustomerDebtSummaryDto.capabilities.adjust` reports the same answer, computed by
the same `roleHasPermission` call the guard uses — so a greyed-out button and a
server refusal cannot disagree ([ADR-0003](../09-decisions/ADR-0003-backend-owns-business-rules.md)).

---

## What is still open

| Question                                        | State                                           | Reference                                               |
| ----------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| Is the role→permission mapping right?           | Least-privilege defaults, unconfirmed           | ASM-017                                                 |
| Existing memberships were backfilled as `owner` | Deliberate, needs a review pass                 | ASM-018                                                 |
| Row-level security in Postgres                  | Not implemented; isolation is application-layer | ASM-009                                                 |
| Do large adjustments need a second approver?    | Undecided                                       | [decision backlog](../09-decisions/decision-backlog.md) |

## Related

- [error-code-catalog.md](error-code-catalog.md)
- [../02-use-cases/UC-AUTH-001-authenticate-and-authorize.md](../02-use-cases/UC-AUTH-001-authenticate-and-authorize.md)
- [../06-api-contracts/capabilities.md](../06-api-contracts/capabilities.md)
