# Debt business rules

Includes the cross-cutting `BR-COMMAND-*` rules, because every one of them exists
to protect the ledger.

---

### BR-DEBT-001 — The debt summary equals the sum of the customer's ledger entries

**Risk:** P0 · **Code:** — · **Tests:** TC-DEBT-001, TC-DEBT-002 · **Cases:** CASE-DEBT-007

```
summary.balance.amountMinor = Σ entries.amount.amountMinor   (per workspace, per customer)
```

Holds after every command. The summary is a projection kept in step inside the same
transaction as the entry that moved it — never a separate job that can fall behind
unnoticed.

---

### BR-DEBT-002 — Debt changes only through ledger-producing commands

**Risk:** P0 · **Code:** — · **Tests:** TC-DEBT-006

Exactly four commands can move a balance:
`ConfirmOrder`, `RecordCustomerPayment`, `ReverseCustomerPayment`,
`AdjustCustomerDebt`.

Editing a customer, creating a draft order, or amending a note must leave the
balance untouched. There is no code path that writes `customer_debt_summaries`
except the one that also appends an entry.

---

### BR-DEBT-003 — A manual debt adjustment requires a reason

**Risk:** P1 · **Code:** `DEBT_ADJUSTMENT_REASON_REQUIRED` · **Tests:** TC-DEBT-003 · **Cases:** CASE-DEBT-006

Both a structured `reasonCode` and non-blank free-text `reason`, stored **on the
ledger entry**, not only in the audit log. This is the only command that moves
money with no underlying document, so the record must carry its own justification.

---

### BR-DEBT-004 — Every ledger entry is attributable to an actor and a command

**Risk:** P0 · **Code:** — · **Tests:** TC-DEBT-004

`actorId` and `commandId` are `NOT NULL` on every entry. No entry is ever written
by anonymous or background code. If a future importer needs to write entries, it
gets a real actor id, not a null.

---

### BR-DEBT-005 — Ledger entries are append-only; reversals compensate

**Risk:** P0 · **Code:** — · **Tests:** TC-DEBT-005 · **Cases:** CASE-DEBT-003

No `UPDATE`, no `DELETE`, ever. Enforced three ways: no such repository method
exists, no such Drizzle call exists, and a Postgres trigger raises an exception on
either statement. A correction is always a new entry, with `reversalOfEntryId`
pointing at what it offsets when it offsets a specific entry.

---

### BR-DEBT-006 — The summary is rebuildable from the entries

**Risk:** P0 · **Code:** — · **Tests:** TC-DEBT-002 · **Cases:** CASE-DEBT-007

`rebuildCustomerDebtSummary(customerId)` recomputes the row from scratch and must
produce a value identical to the incrementally-maintained one. If a projection ever
drifts — a bug, a bad migration, a restore — it can be discarded and recomputed
with no loss. This property is what makes the summary safe to treat as disposable.

---

### BR-DEBT-007 — A debt balance may be negative

**Risk:** P2 · **Code:** — · **Tests:** TC-DEBT-007 · **Cases:** CASE-PAYMENT-003

A negative balance means the customer is in credit. **This is an assumption
(ASM-001), not a decided policy.** It is recorded as a rule so that the absence of
a guard is a deliberate, visible choice rather than an oversight. If the depot
decides prepaid credit is not a thing, the change is one guard plus a rejection
code — and this rule gets deprecated, not silently edited.

---

### BR-DEBT-008 — A manual adjustment amount must be positive

**Risk:** P1 · **Code:** `DEBT_ADJUSTMENT_AMOUNT_INVALID` · **Tests:** TC-DEBT-003

Direction is expressed by the `direction` field (`increase` / `decrease`), never by
the sign of the amount. Allowing both a negative amount and a direction gives two
ways to say the same thing and one way to say something contradictory.

---

## Cross-cutting command rules

### BR-COMMAND-001 — Same idempotency key + same payload ⇒ exactly one effect

**Risk:** P0 · **Code:** — · **Tests:** TC-COMMAND-001, TC-ORDER-004, TC-PAYMENT-002, TC-PAYMENT-005 · **Cases:** CASE-ORDER-005, CASE-PAYMENT-006, CASE-PAYMENT-007, CASE-PAYMENT-011

A replay returns the **stored original result** and performs no writes. This is the
rule that makes a dropped 4G connection harmless. It is checked before any domain
logic runs and is enforced by a unique index on `(workspace_id, idempotency_key)`,
so two concurrent replays cannot both pass the check.

---

### BR-COMMAND-002 — Same idempotency key + different payload ⇒ rejected

**Risk:** P0 · **Code:** `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD` · **Tests:** TC-COMMAND-002

Detected by comparing a SHA-256 hash of the canonicalised payload. Returning the
first result would silently discard the second, genuinely different, command.

---

### BR-COMMAND-003 — transactionTime comes from the command, recordedAt from the server

**Risk:** P0 · **Code:** — · **Tests:** TC-COMMAND-003, TC-ORDER-011 · **Cases:** CASE-ORDER-006, CASE-PAYMENT-008

`transactionTime = command.occurredAt` (may be back-dated).
`recordedAt = server clock at commit` (never client-supplied, never back-dated).
Debt aging reads the first; audit reads the second. See
[../07-data/time-semantics.md](../07-data/time-semantics.md).

---

### BR-COMMAND-004 — occurredAt may not be in the future

**Risk:** P1 · **Code:** `TRANSACTION_TIME_IN_FUTURE` · **Tests:** TC-COMMAND-005

Bounded by a 5-minute tolerance for clock skew on cheap phones. Back-dating is
normal and expected; forward-dating is a wrong device clock, and accepting it would
place entries beyond the horizon of every aging report.

---

### BR-COMMAND-005 — All effects of a command commit atomically

**Risk:** P0 · **Code:** — · **Tests:** TC-COMMAND-004

Aggregate change, ledger entry, summary update, audit record, and command receipt
share one database transaction. A confirmed order without its ledger entry, or a
ledger entry without its receipt, is corrupt data — and a partial failure is exactly
when it would happen.

---

## Related

- [../02-use-cases/UC-DEBT-001-adjust-customer-debt.md](../02-use-cases/UC-DEBT-001-adjust-customer-debt.md)
- [../07-data/ledger-model.md](../07-data/ledger-model.md)
- [../05-casebook/debt-cases.md](../05-casebook/debt-cases.md)
- [../09-decisions/decision-backlog.md](../09-decisions/decision-backlog.md)
