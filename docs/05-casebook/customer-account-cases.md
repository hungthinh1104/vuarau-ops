# Debt casebook

A single customer's ledger, followed through the whole slice. Every balance below
is the running sum of the entries above it — never a stored number that was edited.

| #   | Event            | Entry amount | Balance   | Source type         |
| --- | ---------------- | ------------ | --------- | ------------------- |
| 1   | Sale posted      | `+875 000`   | `875 000` | `sale_posting`      |
| 2   | Payment received | `−500 000`   | `375 000` | `payment`           |
| 3   | Payment reversed | `+500 000`   | `875 000` | `payment_reversal`  |
| 4   | Manual increase  | `+50 000`    | `925 000` | `manual_adjustment` |
| 5   | Manual decrease  | `−250 000`   | `675 000` | `manual_adjustment` |

---

### CASE-ACCOUNT-001 — A posted sale increases debt

**Situation.** The 875.000 ₫ sale from CASE-SALE-001 is posted.

**Expected.** One entry `+875000`, `sourceType = sale_posting`,
`sourceId = saleId`, `transactionTime` from the command. Summary balance
`875000`, `entryCount = 1`.

Debt arises at **confirmation** — not at delivery, not at invoicing (ASM-002).

**Rules.** BR-SALE-007, BR-ACCOUNT-001 · **Tests.** TC-SALE-003, TC-ACCOUNT-001

---

### CASE-ACCOUNT-002 — A payment reduces debt

**Expected.** One entry `−500000`, `sourceType = payment`. Balance `375000`.
Nothing about entry 1 changes.

**Rules.** BR-PAYMENT-002, BR-ACCOUNT-001 · **Tests.** TC-PAYMENT-001

---

### CASE-ACCOUNT-003 — A payment reversal increases debt again

**Expected.** One entry `+500000`, `sourceType = payment_reversal`, with
`reversalOfEntryId` pointing at entry 2. Balance back to `875000`.

The ledger now holds three entries. Entry 2 is untouched — the depot can still see
that the money did arrive and then did not. That pair of entries **is** the
explanation, and it survives any later report, export, or restore.

**Rules.** BR-PAYMENT-005, BR-ACCOUNT-005 · **Tests.** TC-PAYMENT-004, TC-ACCOUNT-005

---

### CASE-ACCOUNT-004 — A manual adjustment increases debt

**Situation.** The customer's pre-existing debt from the paper book, or a delivery
fee agreed by phone: 50.000 ₫.

**Expected.** One entry `+50000`, `sourceType = manual_adjustment`,
`reasonCode = opening_balance`, `reason` stored **on the entry**. Balance `925000`.

**Rules.** BR-ACCOUNT-003, BR-ACCOUNT-004 · **Tests.** TC-ACCOUNT-004

---

### CASE-ACCOUNT-005 — A manual adjustment decreases debt

**Situation.** The owner forgives 250.000 ₫ after a quality complaint.

**Expected.** One entry `−250000`, `reasonCode = goodwill_discount`, reason text
required. Balance `675000`.

**Note.** This is also the CASE-SALE-007 correction path — the same command with a
different `reasonCode`. That the two are indistinguishable in shape is exactly why
`reasonCode` exists: a write-off and a data-entry fix must be separable in a report
even though the ledger movement is identical.

**Rules.** BR-ACCOUNT-003, BR-ACCOUNT-008 · **Tests.** TC-ACCOUNT-003

---

### CASE-ACCOUNT-006 — An adjustment with no reason

**Situation.** A user tries to move a balance with the reason field left blank, or
filled with spaces.

**Expected.** `DEBT_ADJUSTMENT_REASON_REQUIRED`. Nothing written — no entry, no
summary change, no audit record of a successful action.

**Rules.** BR-ACCOUNT-003 · **Tests.** TC-ACCOUNT-003

---

### CASE-ACCOUNT-007 — The summary projection goes stale and is rebuilt

**Situation.** A summary row is wrong — a bad deploy, a restore from an inconsistent
backup, a bug in projection maintenance. It reads `999.999 ₫` while the entries sum
to `675.000 ₫`.

**Expected.** `rebuildCustomerDebtSummary` recomputes from the entries and writes
`675000`. Nothing else changes: **the entries are the truth and the summary is
disposable** (BR-ACCOUNT-006).

The recovery procedure is "delete the summary row and rebuild it", and that is
safe by construction. A system that stored the balance as the truth would have no
such procedure — it would have a reconciliation meeting.

**Rules.** BR-ACCOUNT-001, BR-ACCOUNT-006 · **Tests.** TC-ACCOUNT-002, TC-ACCOUNT-009

---

### CASE-ACCOUNT-008 — The same customer, in all three balance states

**Situation.** One customer over three days.

| Day | Event                           | Entry    | Balance      | Classification    |
| --- | ------------------------------- | -------- | ------------ | ----------------- |
| 1   | Takes a load of 600.000 ₫       | +600.000 | 600.000      | `receivable`      |
| 2   | Pays 600.000 ₫                  | −600.000 | 0            | `settled`         |
| 3   | Pays 400.000 ₫ ahead for Friday | −400.000 | **−400.000** | `customer_credit` |

**Expected.** All three are valid, and the server names which one applies
(BR-ACCOUNT-009). The client never inspects the sign itself.

Day 2 is worth stating: a balance of exactly zero is `settled`, not "empty" and not
"no data". The customer has a complete history and owes nothing, which is a fact
worth showing rather than a blank panel.

Day 3 is the one that goes wrong in a UI. `−400.000` rendered as "nợ −400.000"
sends a worker to collect money from somebody the depot owes. It is a credit and
must be worded as one
([UI state catalog](../06-api-contracts/ui-state-catalog.md)).

The credit is not allocated to Friday's load, or to anything else. It sits on the
account and is consumed arithmetically by the next sale, because the balance is a
sum (ASM-004).

**Rules.** BR-ACCOUNT-007, BR-ACCOUNT-009 · **Tests.** TC-ACCOUNT-010, TC-PAYMENT-011

---

## Unresolved policy visible in these cases

| Question                                     | Current behaviour                                | Reference               |
| -------------------------------------------- | ------------------------------------------------ | ----------------------- |
| May the balance go negative?                 | **Decided:** yes — `customer_credit`             | BR-ACCOUNT-007, ASM-001 |
| When does the receivable arise?              | At posting                                       | ASM-002                 |
| Who may adjust an account by hand?           | **Decided:** owner and accountant                | BR-AUTH-006, ASM-007    |
| How is a wrong posted sale corrected?        | **Decided:** `VoidSale` (+ optional replacement) | BR-ACCOUNT-010, ASM-010 |
| Do large adjustments need a second approver? | No — undecided                                   | ASM-020                 |

## Related

- [../04-business-rules/customer-account-rules.md](../04-business-rules/customer-account-rules.md)
- [../07-data/ledger-model.md](../07-data/ledger-model.md)
- [../09-decisions/decision-backlog.md](../09-decisions/decision-backlog.md)
