# Customer account business rules

A **customer account** is one running record per customer per workspace: an
append-only ledger of entries, plus a balance projection derived from it.

The balance answers "công nợ" — what stands between the depot and this customer
right now. It is signed, and both signs are legitimate:

| Balance | Classification    | Meaning                                       |
| ------- | ----------------- | --------------------------------------------- |
| `> 0`   | `receivable`      | The customer owes the depot                   |
| `= 0`   | `settled`         | Nothing outstanding either way                |
| `< 0`   | `customer_credit` | The depot owes the customer — they paid ahead |

Includes the cross-cutting `BR-COMMAND-*` rules, because every one of them exists
to protect this ledger.

Historical note: these rules were called BR-DEBT-001…008 until the terminology was
closed. Same rules, same numbers
([retired identifiers](../02-use-cases/use-case-catalog.md)).

---

### BR-ACCOUNT-001 — The balance equals the sum of the customer's account entries

**Risk:** P0 · **Code:** — · **Tests:** TC-ACCOUNT-001, TC-ACCOUNT-002 · **Cases:** CASE-ACCOUNT-007

```
balance.amountMinor = Σ entries.amount.amountMinor   (per workspace, per customer)
```

Holds after every command. The balance is a projection kept in step inside the same
transaction as the entry that moved it — never a separate job that can fall behind
unnoticed.

---

### BR-ACCOUNT-002 — The balance changes only through entry-producing commands

**Risk:** P0 · **Code:** — · **Tests:** TC-ACCOUNT-006

Exactly five commands can move a balance:
`PostSale`, `VoidSale`, `RecordCustomerPayment`, `ReverseCustomerPayment`,
`AdjustCustomerDebt`.

Editing a customer, creating or editing a sale draft, or amending a note must
leave the balance untouched. There is no code path that writes
`customer_account_balances` except the one that also appends an entry.

---

### BR-ACCOUNT-003 — A manual adjustment requires a reason

**Risk:** P1 · **Code:** `DEBT_ADJUSTMENT_REASON_REQUIRED` · **Tests:** TC-ACCOUNT-003 · **Cases:** CASE-ACCOUNT-006

Both a structured `reasonCode` and non-blank free-text `reason`, stored **on the
account entry**, not only in the audit log. This is the only command that moves
money with no underlying document, so the record must carry its own justification.

---

### BR-ACCOUNT-004 — Every account entry is attributable to an actor and a command

**Risk:** P0 · **Code:** — · **Tests:** TC-ACCOUNT-004

`actorId` and `commandId` are `NOT NULL` on every entry. No entry is ever written
by anonymous or background code. If a future importer needs to write entries, it
gets a real actor id, not a null.

---

### BR-ACCOUNT-005 — Account entries are append-only; corrections compensate

**Risk:** P0 · **Code:** — · **Tests:** TC-ACCOUNT-005 · **Cases:** CASE-ACCOUNT-003

No `UPDATE`, no `DELETE`, ever. Enforced three ways: no such repository method
exists, no such Drizzle call exists, and a Postgres trigger raises an exception on
either statement. A correction is always a new entry, with `reversalOfEntryId`
pointing at what it offsets when it offsets a specific entry.

---

### BR-ACCOUNT-006 — The balance is rebuildable from the entries

**Risk:** P0 · **Code:** — · **Tests:** TC-ACCOUNT-002, TC-ACCOUNT-009 · **Cases:** CASE-ACCOUNT-007

`rebuildCustomerAccountBalance(customerId)` recomputes the row from scratch and
must produce a value identical to the incrementally-maintained one — after a sale,
after a payment, and after a void alike. If a projection ever drifts — a bug, a bad
migration, a restore — it can be discarded and recomputed with no loss. This
property is what makes the balance safe to treat as disposable, and it is the
reason [ADR-0004](../09-decisions/ADR-0004-append-only-debt-ledger.md) chose a
ledger over a stored number.

---

### BR-ACCOUNT-007 — A balance may be negative, and that means customer credit

**Risk:** P2 · **Code:** — · **Tests:** TC-ACCOUNT-007, TC-PAYMENT-011 · **Cases:** CASE-PAYMENT-003

A payment larger than the outstanding receivable is accepted, and the balance goes
negative. **Decided** (previously ASM-001 / ASM-003): paying ahead for tomorrow's
load is a real thing depots do, and refusing it would reject a genuine business
event while leaving no record that it was attempted.

Any remaining credit is not forced onto a Sale. It sits on the account and is
consumed by the next sale arithmetically, because the balance is a sum; a separate
approved allocation policy may attribute a payment to a posted Sale without
changing the ledger.

---

### BR-ACCOUNT-008 — A manual adjustment amount must be positive

**Risk:** P1 · **Code:** `DEBT_ADJUSTMENT_AMOUNT_INVALID` · **Tests:** TC-ACCOUNT-003

Direction is expressed by the `direction` field (`increase` / `decrease`), never by
the sign of the amount. Allowing both a negative amount and a direction gives two
ways to say the same thing and one way to say something contradictory.

---

### BR-ACCOUNT-009 — The balance carries a typed classification

**Risk:** P1 · **Code:** — · **Tests:** TC-ACCOUNT-010 · **Cases:** CASE-ACCOUNT-008

Every balance read returns `receivable`, `settled`, or `customer_credit`, computed
by one function from the sign of the balance.

The classification is derived at read time and never stored. Storing it would
create a second source of truth for the one number that must be unambiguous, and a
row whose sign and label disagree is worse than no label at all.

It exists so that the UI does not compute it. "Is this negative?" is a trivial test
to duplicate and a costly one to get wrong: a client that renders a credit balance
as a debt sends a worker to collect money from somebody the depot owes.

---

### BR-ACCOUNT-010 — A manual adjustment is not the way to correct a sale

**Risk:** P1 · **Code:** — · **Tests:** TC-ACCOUNT-011 · **Cases:** CASE-SALE-007

`AdjustCustomerDebt` exists for movements with **no underlying document**:

| Legitimate use         | Example                                             |
| ---------------------- | --------------------------------------------------- |
| `opening_balance`      | Nợ cũ carried in from the paper book at go-live     |
| `write_off`            | A balance the depot has decided to stop pursuing    |
| `dispute_settlement`   | An agreed reduction after an argument about quality |
| `migration_correction` | Fixing an import that was wrong at the source       |
| `goodwill_discount`    | A deliberate concession granted after the fact      |

A sale recorded wrongly is **not** on that list. It is corrected with `VoidSale`
plus, where the trade really happened, a replacement sale (BR-SALE-012,
BR-SALE-016).

The distinction is not bureaucratic. An adjustment leaves the wrong sale document
standing and explains the difference only in the ledger, so the document and the
balance tell different stories and only one of them is right. A void makes them
agree, and names which sale was wrong and why. This was ASM-010; it is now decided.

`data_entry_correction` is retained as a reason code for balances imported from
elsewhere, but it is not to be used against a posted sale — the void path covers
that case, and the capability says so.

---

### BR-ACCOUNT-011 — Reconciliation reports corruption; rebuild repairs projections only

**Risk:** P0 · **Codes:** `ACCOUNT_RECONCILIATION_INTEGRITY_FAILURE`,
`ACCOUNT_RECONCILIATION_REBUILD_UNSAFE` · **Tests:** TC-ACCOUNT-011,
TC-E2E-023

Reconciliation compares the complete workspace/customer ledger with its
projection and resolves every entry to its canonical Sale, Payment, reversal or
manual-adjustment source. Missing sources, wrong workspace/customer/amount,
duplicate source identity, zero amounts and malformed references are integrity
failures.

`RebuildAccountProjection` may run only when every diagnostic is projection
drift. It replaces no entry and changes no business source. The command is
idempotent, requires `debt.adjust`, and audits the before/after projection plus
the operator reason.

---

## Cross-cutting command rules

### BR-COMMAND-001 — Same idempotency key + same payload ⇒ exactly one effect

**Risk:** P0 · **Code:** — · **Tests:** TC-COMMAND-001, TC-SALE-004, TC-PAYMENT-002, TC-PAYMENT-005 · **Cases:** CASE-SALE-005, CASE-PAYMENT-006, CASE-PAYMENT-007, CASE-PAYMENT-011

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

**Risk:** P0 · **Code:** — · **Tests:** TC-COMMAND-003, TC-SALE-011 · **Cases:** CASE-SALE-006, CASE-PAYMENT-008

`transactionTime = command.occurredAt` (may be back-dated).
`recordedAt = server clock at commit` (never client-supplied, never back-dated).
Aging reads the first; audit reads the second. See
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

Aggregate change, account entry, balance update, audit record, and command receipt
share one database transaction. A posted sale without its account entry, or an
entry without its receipt, is corrupt data — and a partial failure is exactly when
it would happen.

---

### BR-COMMAND-006 — A refused command leaves nothing behind

**Risk:** P0 · **Code:** — · **Tests:** TC-AUTH-012 · **Cases:** CASE-ACCOUNT-006

A rejection — authentication, authorization, validation, or a domain refusal —
rolls the transaction back. No account entry, no audit record, no command receipt,
and in particular **no consumed idempotency key**.

The key matters most. If a refused command burned its key, the worker who fixes the
payload and resubmits would be told their retry was a duplicate, and the corrected
command would be silently swallowed. Refusal has to be free.

---

## Deprecated rules

| Retired     | Superseded by  | Change                                                     |
| ----------- | -------------- | ---------------------------------------------------------- |
| BR-DEBT-001 | BR-ACCOUNT-001 | Renamed only — "customer account balance" is now "balance" |
| BR-DEBT-002 | BR-ACCOUNT-002 | `PostSale` → `PostSale`; `VoidSale` added                  |
| BR-DEBT-003 | BR-ACCOUNT-003 | Renamed only                                               |
| BR-DEBT-004 | BR-ACCOUNT-004 | Renamed only                                               |
| BR-DEBT-005 | BR-ACCOUNT-005 | Renamed only                                               |
| BR-DEBT-006 | BR-ACCOUNT-006 | Extended: the rebuild must also hold after a void          |
| BR-DEBT-007 | BR-ACCOUNT-007 | Decided rather than assumed; named `customer_credit`       |
| BR-DEBT-008 | BR-ACCOUNT-008 | Renamed only                                               |

## Related

- [../02-use-cases/UC-ACCOUNT-002-adjust-customer-account.md](../02-use-cases/UC-ACCOUNT-002-adjust-customer-account.md), [../02-use-cases/customer-account-use-cases.md](../02-use-cases/customer-account-use-cases.md)
- [../07-data/ledger-model.md](../07-data/ledger-model.md)
- [../05-casebook/customer-account-cases.md](../05-casebook/customer-account-cases.md)
- [sale-rules.md](sale-rules.md), [../09-decisions/decision-backlog.md](../09-decisions/decision-backlog.md)
