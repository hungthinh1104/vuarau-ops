# Payment casebook

---

### CASE-PAYMENT-001 — Customer pays the exact debt

**Situation.** Balance is 875.000 ₫. Chị Lan hands over 875.000 ₫ in cash.

**Expected.** One payment, one ledger entry `−875000`, balance exactly `0`. The
customer row is not touched — there is no "settled" flag to set.

**Rules.** BR-PAYMENT-002, BR-ACCOUNT-001 · **Tests.** TC-PAYMENT-001

---

### CASE-PAYMENT-002 — Partial payment

**Situation.** Balance 875.000 ₫; the customer pays 500.000 ₫ and will settle the
rest next week.

**Expected.** One payment of 500.000, balance 375.000. **No** new concept: a
partial payment is just a payment smaller than the balance. There is no
`partial_payment` type and no per-sale allocation.

**Rules.** BR-PAYMENT-002 · **Tests.** TC-PAYMENT-001

---

### CASE-PAYMENT-003 — Customer pays more than the current debt

**Situation.** Balance 375.000 ₫; the customer hands over 500.000 ₫ and says to
keep the rest against tomorrow's load.

**Expected — assumption ASM-001.** Accepted. Balance becomes **−125.000 ₫**,
meaning the depot owes the customer 125.000 ₫ of credit. No rejection, no
clamping at zero.

**This is an assumption, not a decided policy.** The alternative — refusing
overpayment — is defensible and some depots would prefer it. Recorded as BR-ACCOUNT-007
so the missing guard is visible rather than accidental.

**Rules.** BR-ACCOUNT-007 · **Tests.** TC-PAYMENT-011, TC-ACCOUNT-007

---

### CASE-PAYMENT-004 — The payer is not the customer

**Situation.** Chị Lan's driver drops off 300.000 ₫ on her behalf.

**Expected.** `customerId` is Lan's — the debt is hers. `payerName: "Tài xế anh Hùng"`
records who physically paid. The driver is **not** created as a customer; they owe
nothing.

**Rules.** BR-PAYMENT-002 · **Tests.** TC-PAYMENT-001

---

### CASE-PAYMENT-005 — Payment not allocated to any sale

**Situation.** The customer pays 1.000.000 ₫ against "whatever I owe", covering
parts of three sales.

**Expected — assumption ASM-004.** Accepted with no sale reference at all.
Payments reduce the customer's balance as a whole; there is no allocation table and
no FIFO matching in this phase.

**Consequence, stated plainly.** The system cannot answer "is sale #123 paid?".
It answers "what does this customer owe in total?". Allocation can be added later as
a pure read-side concern without rewriting a single existing ledger row.

**Rules.** BR-PAYMENT-002 · **Tests.** TC-PAYMENT-001

---

### CASE-PAYMENT-006 — The user taps submit twice

**Situation.** The button does not visibly respond, so the worker taps it again
within a second. Both requests reach the server.

**Expected.** Same `idempotencyKey` and payload ⇒ one payment, one ledger entry.
The second request returns the first result. If the first is still committing, the
second gets `COMMAND_IN_PROGRESS`, which **is** retryable.

**Rules.** BR-COMMAND-001 · **Tests.** TC-PAYMENT-002, TC-COMMAND-001

---

### CASE-PAYMENT-007 — Client retries after a timeout

**Situation.** As CASE-SALE-005, but for money received rather than money owed.

**Expected.** Identical: original result returned, exactly one payment, exactly one
ledger entry.

**Rules.** BR-COMMAND-001 · **Tests.** TC-PAYMENT-002

---

### CASE-PAYMENT-008 — Payment captured offline, submitted later

**Situation.** The worker records a 200.000 ₫ payment at 06:15 with no signal. The
phone uploads it at 09:40.

**Expected.** `transactionTime = 06:15`, `recordedAt = 09:40`. The client-generated
`paymentId` and `idempotencyKey` were created at 06:15, so an upload that is itself
retried still produces one payment.

**Note.** Offline _storage and sync_ on the client is out of scope. What is in
scope is that the backend contract already accepts this shape — client-supplied
ids, back-dated `occurredAt`, idempotent replay.

**Rules.** BR-COMMAND-001, BR-COMMAND-003 · **Tests.** TC-COMMAND-003

---

### CASE-PAYMENT-009 — A payment needs full reversal

**Situation.** A 500.000 ₫ bank transfer was recorded, then bounced.

**Expected.** `ReverseCustomerPayment` for the full 500.000 with
`reason: "Chuyển khoản bị hoàn"`. Result: one reversal row, one compensating ledger
entry `+500000`, payment status `reversed` (terminal), balance back up by 500.000.
The original payment row and its `−500000` entry are still there.

**Rules.** BR-PAYMENT-005, BR-PAYMENT-008, BR-ACCOUNT-005 · **Tests.** TC-PAYMENT-004

---

### CASE-PAYMENT-010 — A payment needs partial reversal

**Situation.** 500.000 ₫ was recorded but only 300.000 ₫ actually arrived.

**Expected — assumption ASM-006.** Reverse 200.000 ₫. Status becomes
`partially_reversed`, `reversedAmount = 200000`, remaining reversible 300.000 ₫.
A further reversal of up to 300.000 ₫ is allowed; 300.001 ₫ gives
`PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT`.

**Rules.** BR-PAYMENT-003, BR-PAYMENT-008 · **Tests.** TC-PAYMENT-007, TC-PAYMENT-010

---

### CASE-PAYMENT-011 — The reversal command is submitted twice

**Situation.** The reversal request times out and the client retries with the same
`idempotencyKey` and `reversalId`.

**Expected.** One reversal row, **one** compensating ledger entry, balance moved
once. The second call returns the first result — it does **not** produce
`PAYMENT_ALREADY_REVERSED`, because it is a replay, not a second reversal.

**Rules.** BR-COMMAND-001, BR-PAYMENT-005 · **Tests.** TC-PAYMENT-005

---

## Related

- [../04-business-rules/payment-rules.md](../04-business-rules/payment-rules.md)
- [../02-use-cases/UC-PAYMENT-002-reverse-customer-payment.md](../02-use-cases/UC-PAYMENT-002-reverse-customer-payment.md)
