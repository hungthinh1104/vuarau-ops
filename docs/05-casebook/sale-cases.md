# Sale casebook

Real situations from a depot floor, and exactly what the system does. Where a
policy is undecided, that is stated instead of invented.

---

### CASE-SALE-001 — A valid multi-line sale

**Situation.** Chị Lan takes 12,5 kg cà chua at 18.000 ₫/kg, 30 bó rau muống at
5.000 ₫/bó, and 2 thùng ớt at 250.000 ₫/thùng.

**Expected.**

| Line      | Quantity           | Unit price | Line total    |
| --------- | ------------------ | ---------- | ------------- |
| cà chua   | `12500` milli-kg   | 18.000     | 225.000       |
| rau muống | `30000` milli-bó   | 5.000      | 150.000       |
| ớt        | `2000` milli-thùng | 250.000    | 500.000       |
| **Total** |                    |            | **875.000 ₫** |

Draft at `version = 1`. **No account entry yet** — a draft owes nothing
(BR-SALE-010). On posting: one account entry `+875000`, balance up by exactly that,
classification `receivable`.

**Rules.** BR-SALE-001, BR-SALE-004, BR-SALE-007, BR-SALE-010, BR-SALE-011 ·
**Tests.** TC-SALE-001, TC-SALE-003, TC-SALE-014, TC-SALE-015

---

### CASE-SALE-002 — Posting an empty sale

**Situation.** A worker opens a new sale, gets distracted, and taps post before
adding anything.

**Expected.** `SALE_EMPTY`. The sale stays `draft` and remains editable. No account
entry, no version increment.

**Rules.** BR-SALE-002 · **Tests.** TC-SALE-006

---

### CASE-SALE-003 — Posting the same sale twice, deliberately

**Situation.** The sale is already posted. The owner, unsure whether it went
through, opens it and taps post again — a **new** command with a new idempotency
key.

**Expected.** `SALE_ALREADY_POSTED`. Balance unchanged, still exactly one account
entry. This is different from CASE-SALE-005: the intent is genuinely a second
posting, not a retry.

**Rules.** BR-SALE-005, BR-SALE-007 · **Tests.** TC-SALE-008

---

### CASE-SALE-004 — Posting with a stale version

**Situation.** Two phones have the same sale open at `version = 1`. Phone A adds a
line (sale goes to `version = 2`). Phone B, still showing the old total, taps post
with `expectedVersion = 1`.

**Expected.** `SALE_VERSION_CONFLICT` with `expectedVersion: 1, actualVersion: 2`.
Phone B re-reads and sees the line it did not know about. Nothing is posted against
a total the user never saw.

**Rules.** BR-SALE-006 · **Tests.** TC-SALE-005

---

### CASE-SALE-005 — Retrying a posting after a network timeout

**Situation.** The worker taps post. The request reaches the server and commits;
the response is lost in a 4G dead spot. The client retries automatically with the
**same** `idempotencyKey` and payload.

**Expected.** The stored original result is returned. The sale is posted once.
**Exactly one** account entry exists. The customer is not billed twice.

This is the single most important case in the slice — it is the difference between
a system a depot trusts and one it does not.

**Rules.** BR-COMMAND-001, BR-SALE-007 · **Tests.** TC-SALE-004

---

### CASE-SALE-006 — A sale entered later than it happened

**Situation.** A sale at 05:00 is entered at 11:00 because the worker was busy. The
client sends `occurredAt = 05:00`.

**Expected.** `transactionTime = 05:00`, `recordedAt = 11:00`. Both stored, neither
inferred from the other. Aging counts from 05:00; the audit trail shows the
six-hour gap, which is itself operationally interesting.

**Rules.** BR-COMMAND-003 · **Tests.** TC-SALE-011

---

### CASE-SALE-007 — A posted sale turns out to be wrong

**Situation.** The sale was posted at 875.000 ₫. The customer says they only took
one thùng of ớt, not two. The real total is 625.000 ₫.

**Expected.** The posted sale is **not** edited and **not** deleted (BR-SALE-008).
Two ordinary acts follow:

1. `VoidSale` with `reasonCode: wrong_amount`,
   `reason: "Ghi nhầm 2 thùng ớt, thực tế 1 thùng"` — one void record, one account
   entry of `−875000` (BR-SALE-012).
2. `CreateSaleDraft` with `replacesSaleId` pointing at the voided sale, the correct
   lines, then `PostSale` — one account entry of `+625000` (BR-SALE-016).

The account then reads:

| Entry                      | Amount   | Running balance |
| -------------------------- | -------- | --------------- |
| sale_posting (wrong sale)  | +875.000 | 875.000         |
| sale_void                  | −875.000 | 0               |
| sale_posting (replacement) | +625.000 | **625.000**     |

Three entries, all standing, arithmetic correct, and the history explains itself.
The wrong sale reads `voided` and stays visible with its reason; the replacement
links back to it.

**How this used to work, and why it changed.** Until the terminology closed, this
case was corrected with a single `AdjustCustomerDebt` of `−250.000`. The balance
came out right, but the sale document still said 875.000 ₫ — so the document and
the balance disagreed and only the ledger explained why, in free text. ASM-010 is
now decided, and `AdjustCustomerDebt` is explicitly not the correction path for a
sale (BR-ACCOUNT-010).

**Rules.** BR-SALE-008, BR-SALE-012, BR-SALE-016, BR-ACCOUNT-010 ·
**Tests.** TC-SALE-009, TC-SALE-021, TC-SALE-027, TC-ACCOUNT-011

---

### CASE-SALE-008 — A load comes back on the truck

**Situation.** 2 thùng ớt were posted at 500.000 ₫. The buyer refuses them at
delivery — the quality is wrong. Nothing replaces them; the trade simply did not
happen.

**Expected.** `VoidSale` with `reasonCode: goods_returned` and an explanation. One
compensating entry of `−500.000`. **No replacement sale** — requiring one would
invent a trade that never occurred (BR-SALE-016).

The sale reads `voided`, the balance returns to what it was, and the void reason
records why.

**Rules.** BR-SALE-012, BR-SALE-014, BR-SALE-016 · **Tests.** TC-SALE-021, TC-SALE-026

---

### CASE-SALE-009 — A draft is abandoned

**Situation.** A worker starts entering a load, the buyer changes their mind, and
the half-typed draft is left on screen.

**Expected in this phase.** Nothing happens automatically. The draft stays `draft`
forever, harmless: it has no financial effect (BR-SALE-010) and appears in no
balance.

**Planned.** `DiscardSaleDraft` marks it discarded so it stops cluttering the
day's list. The row is kept rather than deleted, because "somebody entered this and
then thought better of it" is information, and because a discarded draft
resubmitted by an offline client must be recognised as a replay rather than
accepted as new (BR-SALE-018).

**Not decided:** whether stale drafts should expire automatically, and after how
long. Recorded as ASM-021 — a background job that silently removes a worker's
in-progress entry is exactly the sort of helpfulness that loses data.

**Rules.** BR-SALE-010, BR-SALE-018 · **Tests.** TC-SALE-014; planned TC-SALE-020

---

### CASE-SALE-010 — Two people void the same sale at once

**Situation.** The owner and the accountant both notice the same wrong sale within
seconds of each other. Both tap void, with **different** idempotency keys — these
are genuinely two commands, not a retry.

**Expected.** Exactly one succeeds. The other gets `SALE_ALREADY_VOIDED`. The
customer is credited once, not twice.

Three independent guards produce that outcome, and the third is the one that
matters when the first two have a bug: the row lock serialises the two
transactions, the domain check finds the existing void record, and
`UNIQUE (sale_id)` on `sale_voids` refuses the second insert regardless
(BR-SALE-013).

**Related.** Voiding a **draft** is refused differently — `SALE_NOT_POSTED`,
because the remedy is to discard it (BR-SALE-015).

**Rules.** BR-SALE-013, BR-SALE-015 · **Tests.** TC-SALE-023, TC-SALE-024, TC-SALE-025

---

### CASE-SALE-011 — Voiding a sale the customer already paid

**Situation.** A sale of 500.000 ₫ was posted and the customer paid it in full. The
next day it turns out the goods were never delivered.

**Expected.** The void is accepted and the **payment is not touched** — that money
really did arrive, and reversing it would misrepresent what happened.

| Entry        | Amount   | Running balance |
| ------------ | -------- | --------------- |
| sale_posting | +500.000 | 500.000         |
| payment      | −500.000 | 0               |
| sale_void    | −500.000 | **−500.000**    |

The balance ends at `−500.000`, classification `customer_credit` (BR-ACCOUNT-007).
The depot owes the customer 500.000 ₫, which is the truth: they hold cash for goods
they never received.

The UI must render this as a credit, never as a negative debt
([UI state catalog](../06-api-contracts/ui-state-catalog.md)).

What happens next is a business decision, not a system one: the credit is spent on
the next load, or refunded outside this system. There is no `RefundCustomer`
command and none is invented here.

**Rules.** BR-SALE-012, BR-ACCOUNT-007, BR-ACCOUNT-009 · **Tests.** TC-SALE-022, TC-ACCOUNT-010

---

### CASE-SALE-012 — A sale with no agreed payment date

**Situation.** The ordinary case. Chị Lan takes a load and will pay "khi nào bán
xong" — when she has sold it. No date is agreed and none is entered.

**Expected.** `dueAt` is null. The sale is posted normally, the receivable stands,
and its `dueState` is `no_due_date`.

**It is never reported as overdue**, no matter how old it gets (BR-SALE-017). Aging
still works — the entry carries `transactionTime`, so "this balance is 40 days old"
is answerable — but _overdue_ is a judgement about a promise, and no promise was
made.

The UI shows nothing for `no_due_date`: not a warning, not an amber chip. Most
depot sales are this case, and a warning that appears on nearly everything is read
as decoration within a week.

**Rules.** BR-SALE-017 · **Tests.** TC-SALE-018

---

## Related

- [../04-business-rules/sale-rules.md](../04-business-rules/sale-rules.md)
- [../02-use-cases/sale-use-cases.md](../02-use-cases/sale-use-cases.md)
- [payment-cases.md](payment-cases.md), [customer-account-cases.md](customer-account-cases.md)
