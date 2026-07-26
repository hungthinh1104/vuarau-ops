# Debt casebook

A single customer's ledger, followed through the whole slice. Every balance below
is the running sum of the entries above it — never a stored number that was edited.

| #   | Event            | Entry amount | Balance   | Source type          |
| --- | ---------------- | ------------ | --------- | -------------------- |
| 1   | Order confirmed  | `+875 000`   | `875 000` | `order_confirmation` |
| 2   | Payment received | `−500 000`   | `375 000` | `payment`            |
| 3   | Payment reversed | `+500 000`   | `875 000` | `payment_reversal`   |
| 4   | Manual increase  | `+50 000`    | `925 000` | `manual_adjustment`  |
| 5   | Manual decrease  | `−250 000`   | `675 000` | `manual_adjustment`  |

---

### CASE-DEBT-001 — A confirmed order increases debt

**Situation.** The 875.000 ₫ order from CASE-ORDER-001 is confirmed.

**Expected.** One entry `+875000`, `sourceType = order_confirmation`,
`sourceId = orderId`, `transactionTime` from the command. Summary balance
`875000`, `entryCount = 1`.

Debt arises at **confirmation** — not at delivery, not at invoicing (ASM-002).

**Rules.** BR-ORDER-007, BR-DEBT-001 · **Tests.** TC-ORDER-003, TC-DEBT-001

---

### CASE-DEBT-002 — A payment reduces debt

**Expected.** One entry `−500000`, `sourceType = payment`. Balance `375000`.
Nothing about entry 1 changes.

**Rules.** BR-PAYMENT-002, BR-DEBT-001 · **Tests.** TC-PAYMENT-001

---

### CASE-DEBT-003 — A payment reversal increases debt again

**Expected.** One entry `+500000`, `sourceType = payment_reversal`, with
`reversalOfEntryId` pointing at entry 2. Balance back to `875000`.

The ledger now holds three entries. Entry 2 is untouched — the depot can still see
that the money did arrive and then did not. That pair of entries **is** the
explanation, and it survives any later report, export, or restore.

**Rules.** BR-PAYMENT-005, BR-DEBT-005 · **Tests.** TC-PAYMENT-004, TC-DEBT-005

---

### CASE-DEBT-004 — A manual adjustment increases debt

**Situation.** The customer's pre-existing debt from the paper book, or a delivery
fee agreed by phone: 50.000 ₫.

**Expected.** One entry `+50000`, `sourceType = manual_adjustment`,
`reasonCode = opening_balance`, `reason` stored **on the entry**. Balance `925000`.

**Rules.** BR-DEBT-003, BR-DEBT-004 · **Tests.** TC-DEBT-004

---

### CASE-DEBT-005 — A manual adjustment decreases debt

**Situation.** The owner forgives 250.000 ₫ after a quality complaint.

**Expected.** One entry `−250000`, `reasonCode = goodwill_discount`, reason text
required. Balance `675000`.

**Note.** This is also the CASE-ORDER-007 correction path — the same command with a
different `reasonCode`. That the two are indistinguishable in shape is exactly why
`reasonCode` exists: a write-off and a data-entry fix must be separable in a report
even though the ledger movement is identical.

**Rules.** BR-DEBT-003, BR-DEBT-008 · **Tests.** TC-DEBT-003

---

### CASE-DEBT-006 — An adjustment with no reason

**Situation.** A user tries to move a balance with the reason field left blank, or
filled with spaces.

**Expected.** `DEBT_ADJUSTMENT_REASON_REQUIRED`. Nothing written — no entry, no
summary change, no audit record of a successful action.

**Rules.** BR-DEBT-003 · **Tests.** TC-DEBT-003

---

### CASE-DEBT-007 — The summary projection goes stale and is rebuilt

**Situation.** A summary row is wrong — a bad deploy, a restore from an inconsistent
backup, a bug in projection maintenance. It reads `999.999 ₫` while the entries sum
to `675.000 ₫`.

**Expected.** `rebuildCustomerDebtSummary` recomputes from the entries and writes
`675000`. Nothing else changes: **the entries are the truth and the summary is
disposable** (BR-DEBT-006).

The recovery procedure is "delete the summary row and rebuild it", and that is
safe by construction. A system that stored the balance as the truth would have no
such procedure — it would have a reconciliation meeting.

**Rules.** BR-DEBT-001, BR-DEBT-006 · **Tests.** TC-DEBT-002

---

## Unresolved policy visible in these cases

| Question                                          | Current behaviour        | Reference            |
| ------------------------------------------------- | ------------------------ | -------------------- |
| May the balance go negative?                      | Yes, unguarded           | ASM-001, BR-DEBT-007 |
| When does debt arise?                             | At order confirmation    | ASM-002              |
| Who may adjust debt?                              | Any workspace member     | ASM-007              |
| Can a confirmed order be cancelled after payment? | No cancel command exists | ASM-005              |

## Related

- [../04-business-rules/debt-rules.md](../04-business-rules/debt-rules.md)
- [../07-data/ledger-model.md](../07-data/ledger-model.md)
- [../09-decisions/decision-backlog.md](../09-decisions/decision-backlog.md)
