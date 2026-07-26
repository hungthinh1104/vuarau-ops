# Decision backlog — business policy, decided and undecided

Every entry is classified. There are exactly three classifications, and **no entry
is left with an ambiguous default**:

| Classification            | Meaning                                                                           |
| ------------------------- | --------------------------------------------------------------------------------- |
| **decided**               | Answered. The rule, the case and the test exist. Not a default any more.          |
| **deferred with trigger** | Still open, with a stated default **and a named event that forces the decision**. |
| **operational action**    | Not a design question. Somebody has to go and do something.                       |

A "deferred" entry without a trigger is just a guess with better manners, so every
deferred row below names the event that ends the deferral.

## The register

| ID      | Question                                                      | Classification            | Answer / default                                                    | Trigger or owner                                     |
| ------- | ------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| ASM-001 | Can a customer balance go negative?                           | **decided**               | Yes — `customer_credit` (BR-ACCOUNT-007, BR-ACCOUNT-009)            | —                                                    |
| ASM-002 | Does the receivable arise at posting, delivery, or invoicing? | **deferred with trigger** | **Posting**                                                         | Before the first depot records real sales            |
| ASM-003 | Can a payment exceed the receivable?                          | **decided**               | Yes — follows ASM-001                                               | —                                                    |
| ASM-004 | Can a payment stay unallocated to a sale?                     | **decided**               | Yes — allocation is not modelled and will not be                    | —                                                    |
| ASM-005 | Can a posted sale be cancelled?                               | **decided**               | It is **voided**, not cancelled (BR-SALE-012)                       | —                                                    |
| ASM-006 | Are partial payment reversals allowed?                        | **decided**               | Yes (BR-PAYMENT-003)                                                | —                                                    |
| ASM-007 | What permission is required to adjust a balance?              | **decided**               | `debt.adjust` — owner, accountant (ADR-0011)                        | —                                                    |
| ASM-008 | How do product price changes affect posted sales?             | **decided**               | Never — lines snapshot name and price (BR-SALE-011)                 | —                                                    |
| ASM-009 | Is workspace isolation enforced by RLS or the application?    | **deferred with trigger** | **Application layer**                                               | First multi-tenant production deployment             |
| ASM-010 | How is a wrong posted sale corrected?                         | **decided**               | `VoidSale` + optional replacement (BR-ACCOUNT-010)                  | —                                                    |
| ASM-011 | Are units convertible (lạng → gram)?                          | **deferred with trigger** | **No conversion at all**                                            | First depot that quotes one product in two units     |
| ASM-012 | Should duplicate customer names be blocked?                   | **deferred with trigger** | **Allowed, no warning**                                             | First support report of a misattributed balance      |
| ASM-013 | Does the API need a compiled `dist/` build?                   | **decided**               | No — Node 24 runs TypeScript directly                               | —                                                    |
| ASM-014 | How long are `command_receipts` retained?                     | **deferred with trigger** | **Forever** — no pruning                                            | The table passes 10 M rows or query latency degrades |
| ASM-015 | Does a customer have a credit limit?                          | **deferred with trigger** | **No such concept**                                                 | A depot asks to block a sale on outstanding balance  |
| ASM-016 | What makes a balance "overdue"? Payment terms?                | **deferred with trigger** | `dueAt` per sale, nullable; **null is never overdue** (BR-SALE-017) | A depot asks for default terms or an aging report    |
| ASM-017 | Is the role→permission mapping right beyond `debt.adjust`?    | **operational action**    | Least-privilege defaults, unconfirmed                               | Depot owner confirms the table                       |
| ASM-018 | Existing memberships were backfilled as `owner`               | **operational action**    | Deliberate; roles need assigning                                    | Operator assigns real roles before go-live           |
| ASM-019 | May a customer with a non-zero balance be deactivated?        | **deferred with trigger** | **Yes** — balance preserved and surfaced (BR-CUSTOMER-003)          | First depot that deactivates a customer in debt      |
| ASM-020 | Do large adjustments or voids need a second approver?         | **deferred with trigger** | **No** — one actor, fully attributed                                | A depot reports a disputed adjustment or void        |
| ASM-021 | Do abandoned sale drafts expire?                              | **deferred with trigger** | **No** — drafts live forever, harmlessly                            | The draft list becomes unusable in daily use         |
| ASM-022 | Are reads audited?                                            | **deferred with trigger** | **No** — only state changes are audited                             | A depot needs to know who looked at a balance        |

Seven decided, eleven deferred with a named trigger, two operational, two new this
round (ASM-021, ASM-022) that were previously unstated assumptions rather than
recorded ones.

---

## What closed this round, and why it matters

### ASM-001 / ASM-003 — negative balances · **decided: yes**

A payment larger than the receivable is accepted and the balance goes negative,
meaning the depot owes the customer credit. That is now a named classification
(`customer_credit`) rather than an unlabelled minus sign, so a client cannot
render it as a debt by accident (BR-ACCOUNT-009).

Refusing overpayment would reject a genuine business event — a customer paying
ahead for tomorrow's load — and the rejection would be _invisible_ in the data,
since no record of the attempt would exist.

### ASM-005 — cancelling a posted sale · **decided: it is voided**

`cancelled` was one word doing two jobs: throwing away a half-typed draft, and
undoing a completed sale. They differ in the only way that matters — the first
moves no money and the second moves all of it.

They are now two operations. `DiscardSaleDraft` (planned) for the first;
`VoidSale` for the second, with a full compensating entry, a mandatory reason
code, and a different permission.

### ASM-010 — correcting a posted sale · **decided: void plus replacement**

Was: a compensating `AdjustCustomerDebt`. The balance came out right, but the sale
document still showed the wrong total, and only the ledger explained the difference
— in free text.

Now: `VoidSale` compensates the whole posting, and an optional replacement sale
carries `replacesSaleId`. The document and the balance agree, the correction names
which sale was wrong and why, and `AdjustCustomerDebt` is explicitly no longer the
path (BR-ACCOUNT-010).

### ASM-008 — price changes · **decided: snapshots, re-affirmed at posting**

Lines snapshot product name, quantity, unit and unit price. Posting re-affirms the
snapshot, because a draft may have sat overnight and the numbers finally agreed are
the ones in the row at the moment of posting (BR-SALE-011).

---

## The ones that will still hurt if left

### ASM-002 — when the receivable arises · **deferred, trigger: first real data**

**Default:** at posting.

**Why this default:** posting is the only event the slice models, and it is what a
depot means by "chốt đơn".

**Why it is still the most dangerous entry here:** it is the least reversible. If
the receivable should really arise at delivery, every `sale_posting` entry in
production carries the wrong `transactionTime`, and fixing it means back-filling an
immutable row — which the design forbids. The escape hatch is that
`LedgerSourceType` is an enum: a `delivery_note` source can be added and posting
entries stopped, but historical entries stay wrong.

**Trigger:** ask before the first depot records real sales. After that the cost
only grows.

### ASM-015 / ASM-016 — credit limits and overdue balances · **deferred**

`design.md` specifies an `over_credit_limit` state on sale entry, a "debt policy
warning", and an "overdue amount" plus "risk status" on the customer screen.

**None of those exist in the backend**, and only one has moved: `dueAt` is now a
nullable field per sale, and BR-SALE-017 fixes what a null means — never overdue.
That bounds the question without answering it. What payment terms a depot wants,
what the default term is, and whether there is a credit limit at all are still
unanswered.

**Do not invent them.** A credit limit at the wrong threshold refuses real sales;
an overdue rule with the wrong terms puts customers on a chase list who are not
late. Every ledger entry carries business time, so any terms model can be applied
retrospectively without a migration — which is why deferring is cheap here and
guessing is not.

### ASM-017 / ASM-018 — the role table is a guess, and everyone is an owner · **operational**

**ASM-017.** Only `debt.adjust` was specified. Every other role→permission pairing
is a least-privilege default a developer chose. The three that most need a depot
owner's answer:

- may a **delivery driver record the cash they collect**? Defaulted to _no_, which
  is safe and quite possibly wrong for how these depots actually work;
- may **sales post sales**? Defaulted to _yes_, because that is the job — but
  posting is the moment the receivable is created, so it deserves a decision;
- may **sales void sales**? Defaulted to _no_. Somebody who can both create and
  erase a sale can make a load disappear with nothing missing from the balance.

**ASM-018.** Migration `0002` backfilled `workspace_memberships.role` as `owner` —
the only choice that could not lock an existing depot out of its own data. It means
that immediately after migrating, **every existing member holds `debt.adjust` and
`sale.void`**.

Closing ASM-018 is not a code change: assign real roles, then verify no unintended
owners remain.

---

## How to close an item

1. Get the answer from the depot owner.
2. Write an ADR if the decision has architectural consequences.
3. Update the rule, the case, and the test.
4. Change the row above to **decided**, linking the ADR. Do not delete the row —
   the history of what was once uncertain is useful, and the next person will
   otherwise assume it was never in question.

## Related

- [ADR-0012-sale-void-and-replacement.md](ADR-0012-sale-void-and-replacement.md)
- [../04-business-rules/sale-rules.md](../04-business-rules/sale-rules.md)
- [../04-business-rules/customer-account-rules.md](../04-business-rules/customer-account-rules.md)
- [../02-use-cases/use-case-catalog.md](../02-use-cases/use-case-catalog.md)
