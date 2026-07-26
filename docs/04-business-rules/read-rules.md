# Read business rules

The query side. Authorization is not repeated here — every read runs the same
`authorizeWorkspaceAccess` a command runs (BR-AUTH-001 … BR-AUTH-004), and a rule
restating that would be a second place for it to drift.

These are the rules that are genuinely about reading.

---

### BR-READ-001 — A page boundary never repeats or skips a row

**Risk:** P1 · **Code:** — · **Tests:** TC-READ-004, TC-READ-008 · **Cases:** CASE-READ-001

Every list is keyset-paged on a deterministic `(sort value, id)` key, matching the
`ORDER BY` exactly. `OFFSET` is not used anywhere.

Two properties follow, and both matter when the list is money:

- **Uniqueness.** A sort value alone is not unique. A depot posting a morning's
  load produces sales sharing a `transactionTime` to the millisecond, so a
  boundary that knew only the timestamp would drop rows between pages.
- **Stability under writes.** A sale posted while somebody is paging does not
  shift what they have already seen. With `OFFSET` it does, and the reader is
  handed the same sale twice with no way to tell.

A cursor that does not decode is treated as the first page rather than as an
error: cursors travel in URLs, and a 500 on a hand-edited one turns a cosmetic
problem into a broken screen.

---

### BR-READ-002 — A read returns a published DTO, never a database row

**Risk:** P1 · **Code:** — · **Tests:** TC-READ-009

Every projection is an explicit field-by-field map. No `SELECT *` result and no
aggregate is returned directly.

A spread would make every future internal column part of the public contract by
accident — the day somebody adds a column for an internal purpose, it ships to
every client, and removing it is then a breaking change nobody agreed to.

The contract test parses every read with the same schema a browser client would
use, so a DTO that drifts from its contract fails in the suite rather than in the
first UI to render it.

---

### BR-READ-003 — Derived state is computed by the server, once

**Risk:** P1 · **Code:** — · **Tests:** TC-READ-004, TC-READ-006

A read returns a sale's `financialState` and `dueState`, an account balance's
`classification`, a payment's `remainingReversibleAmount`, and capabilities —
all computed server-side, all by the functions the command guards use.

None of these is hard. That is exactly why they would be duplicated on the client,
and each has a wrong answer that costs money: a credit rendered as a debt sends a
worker to collect from somebody the depot owes; a mis-subtracted remaining amount
offers to reverse money that is not there; a `no_due_date` sale shown as overdue
puts most of a depot's customers on a chase list.

A list row and a detail read must produce the **same** capabilities for the same
aggregate. They share an implementation for that reason, and TC-READ-004 asserts
it, because "the button was enabled in the list and disabled on the page" is the
symptom of a second copy.

---

## Related

- [../06-api-contracts/read-models.md](../06-api-contracts/read-models.md)
- [authorization-rules.md](authorization-rules.md)
- [../05-casebook/read-cases.md](../05-casebook/read-cases.md)
