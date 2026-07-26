# Order casebook

Real situations from a depot floor, and exactly what the system does. Where a
policy is undecided, that is stated instead of invented.

---

### CASE-ORDER-001 — A valid multi-line order

**Situation.** Chị Lan takes 12,5 kg cà chua at 18.000 ₫/kg, 30 bó rau muống at
5.000 ₫/bó, and 2 thùng ớt at 250.000 ₫/thùng.

**Expected.**

| Line      | Quantity           | Unit price | Line total    |
| --------- | ------------------ | ---------- | ------------- |
| cà chua   | `12500` milli-kg   | 18.000     | 225.000       |
| rau muống | `30000` milli-bó   | 5.000      | 150.000       |
| ớt        | `2000` milli-thùng | 250.000    | 500.000       |
| **Total** |                    |            | **875.000 ₫** |

Draft at `version = 1`. No ledger entry yet — a draft owes nothing.
On confirm: one ledger entry `+875000`, balance up by exactly that.

**Rules.** BR-ORDER-001, BR-ORDER-004, BR-ORDER-007 · **Tests.** TC-ORDER-001, TC-ORDER-003

---

### CASE-ORDER-002 — Confirming an empty order

**Situation.** A worker opens a new order, gets distracted, and taps confirm
before adding anything.

**Expected.** `ORDER_EMPTY`. The order stays `draft` and remains editable. No
ledger entry, no version increment.

**Rules.** BR-ORDER-002 · **Tests.** TC-ORDER-006

---

### CASE-ORDER-003 — Confirming the same order twice, deliberately

**Situation.** The order is already confirmed. The owner, unsure whether it went
through, opens it and taps confirm again — a **new** command with a new
idempotency key.

**Expected.** `ORDER_ALREADY_CONFIRMED`. Debt unchanged, still exactly one ledger
entry. This is different from CASE-ORDER-005: the intent is genuinely a second
confirmation, not a retry.

**Rules.** BR-ORDER-005, BR-ORDER-007 · **Tests.** TC-ORDER-008

---

### CASE-ORDER-004 — Confirming with a stale version

**Situation.** Two phones have the same order open at `version = 1`. Phone A adds
a line (order goes to `version = 2`). Phone B, still showing the old total, taps
confirm with `expectedVersion = 1`.

**Expected.** `ORDER_VERSION_CONFLICT` with `expectedVersion: 1, actualVersion: 2`.
Phone B re-reads and sees the line it did not know about. Nothing is confirmed
against a total the user never saw.

**Rules.** BR-ORDER-006 · **Tests.** TC-ORDER-005

---

### CASE-ORDER-005 — Retrying confirmation after a network timeout

**Situation.** The worker taps confirm. The request reaches the server and
commits; the response is lost in a 4G dead spot. The client retries automatically
with the **same** `idempotencyKey` and payload.

**Expected.** The stored original result is returned. The order is confirmed once.
**Exactly one** ledger entry exists. The customer is not billed twice.

This is the single most important case in the slice — it is the difference between
a system a depot trusts and one it does not.

**Rules.** BR-COMMAND-001, BR-ORDER-007 · **Tests.** TC-ORDER-004

---

### CASE-ORDER-006 — An order entered later than it happened

**Situation.** A sale at 05:00 is entered at 11:00 because the worker was busy.
The client sends `occurredAt = 05:00`.

**Expected.** `transactionTime = 05:00`, `recordedAt = 11:00`. Both stored, neither
inferred from the other. Debt aging counts from 05:00; the audit trail shows the
six-hour gap, which is itself operationally interesting.

**Rules.** BR-COMMAND-003 · **Tests.** TC-ORDER-011

---

### CASE-ORDER-007 — A confirmed order turns out to be wrong

**Situation.** The order was confirmed at 875.000 ₫. The customer says they only
took one thùng of ớt, not two. The real total is 625.000 ₫.

**Expected in this phase.** The confirmed order is **not** edited and **not**
deleted (BR-ORDER-008). The correction is an `AdjustCustomerDebt` of
`direction: decrease`, `amount: 250000`,
`reasonCode: data_entry_correction`,
`reason: "Đơn 875k ghi nhầm 2 thùng ớt, thực tế 1 thùng"`.

The order still reads 875.000 ₫, the ledger shows the correction, and both are
visible.

**Known limitation.** This is honest but coarse: the order document and the
customer's balance now disagree, and only the ledger explains why. A proper
`AmendOrder` command that supersedes the confirmed order with a new version is
needed. Tracked as ASM-010 — **not** silently designed around here.

**Rules.** BR-ORDER-008, BR-DEBT-003 · **Tests.** TC-ORDER-009, TC-DEBT-003

---

## Related

- [../04-business-rules/order-rules.md](../04-business-rules/order-rules.md)
- [payment-cases.md](payment-cases.md), [debt-cases.md](debt-cases.md)
