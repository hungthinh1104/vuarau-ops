# ASM-002 — when does the customer start owing?

**One page. Four questions. Ask them before the first depot records a real sale.**

This is the instrument that confirms
[ADR-0014](ADR-0014-debt-recognition-at-posting.md). The software already answers
the question — a receivable appears the moment a sale is posted — and that answer
is now a rule, a case and a test. What is not yet on record is the depot owner
saying it is the right answer.

Get that on record **before** real sales exist, because a wrong answer here cannot
be corrected afterwards: every posted entry carries a `transactionTime` that would
be wrong, and the ledger is append-only by design (ADR-0004).

---

## How to ask

Ask the depot owner, not a worker. The owner is the person who argues about a
balance with a customer six months later, and that argument is what this decides.

Ask the four questions in order and **write the answer in their words**. Do not
explain what the software does first — a described answer is the answer somebody
was given, not the one they hold. If they ask what the software does, say "I'll
show you after these four questions".

Nothing here takes longer than five minutes. It is short on purpose: a long
questionnaire gets the answers somebody thinks you want.

---

## The four questions

### 1. "Chốt đơn" nghĩa là gì? Lúc đó anh/chị đang làm gì?

_What does "chốt đơn" mean? What are you actually doing at that moment?_

```text
Answer, verbatim:


```

**Why it is asked.** The whole design rests on `chốt đơn` naming a single, sharp
moment. If it turns out to describe a stretch of the morning — the load is agreed
at 4, weighed at 5, priced at 6 — then "the moment the sale happened" is a range,
and the software is asking for a point.

---

### 2. Lúc chốt đơn, hàng đã giao cho khách chưa?

_At the moment you chốt đơn, have the goods already gone to the customer?_

```text
☐ Đã giao rồi        ☐ Chưa giao, giao sau        ☐ Tuỳ khách / tuỳ hôm

Notes:


```

**Why it is asked.** The system models a **sale** — goods handed over, price
agreed — and not an order (ADR-0013). If goods routinely move a day after chốt
đơn, then chốt đơn is an order, and a receivable created there is a receivable for
goods the customer does not have yet.

---

### 3. Lúc đó số lượng và giá đã chốt hẳn chưa, hay còn sửa được?

_At that moment, are the quantity and the price final — or do they still change?_

```text
☐ Chốt hẳn           ☐ Còn cân lại / còn thoả giá        ☐ Tuỳ mặt hàng

What changes afterwards, and how often:


```

**Why it is asked.** A posted sale is immutable (BR-SALE-008). If numbers still
move after chốt đơn, every such sale becomes a void plus a replacement, and the
depot's account timeline fills with corrections that describe haggling rather than
trade. That is survivable but it must be known before, not discovered at volume.

---

### 4. Khách nợ mình từ lúc nào — lúc chốt đơn hay lúc giao hàng?

_From what moment does the customer owe you — chốt đơn, or delivery?_

```text
☐ Từ lúc chốt đơn    ☐ Từ lúc giao hàng    ☐ Từ lúc viết hoá đơn    ☐ Khác:

Their words:


```

**Why it is asked.** This is ASM-002 itself. Everything above is context for it.

---

## Signed off

```text
Depot:                                     Date:

Owner (name, role):

Facilitator:

Answer recorded for ASM-002:   ☐ posting   ☐ delivery   ☐ invoicing   ☐ other
```

**Until this block is filled in, ADR-0014 is accepted and unconfirmed, and no
depot may treat what it records in this software as its official account book.**

---

## If the answer is not "posting"

Do not edit anything in a hurry. The answer changes what gets built, not what has
already been recorded.

| Answer                | What it means                                                        | What to do                                                                                                              |
| --------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Delivery**          | Chốt đơn is an agreement; the receivable starts when the load leaves | Stop the pilot before real sales. A delivery event, its command and its ledger source type are a milestone, not a patch |
| **Invoicing**         | A separate document creates the receivable                           | Same — and ask whether the depot invoices at all, or whether "hoá đơn" here means the notebook page                     |
| **"It depends"**      | Two kinds of trade under one word                                    | Record both shapes on the worksheet. Do not average them into one default                                               |
| **Posting, with ifs** | The default holds, and the ifs are worth writing down                | Record the ifs as new `ASM-*` rows in [decision-backlog.md](decision-backlog.md). Do not fold them into ASM-002         |

The escape hatch, stated so nobody has to rediscover it under pressure:
`ACCOUNT_ENTRY_SOURCE_TYPES` is a closed enum. A `delivery_note` source can be
added and `sale_posting` entries stopped. **Entries already written stay wrong** —
which is the entire reason this page exists.

## Related

- [ADR-0014-debt-recognition-at-posting.md](ADR-0014-debt-recognition-at-posting.md) — the decision this confirms
- [decision-backlog.md](decision-backlog.md) — ASM-002 and ASM-023
- [../04-business-rules/sale-rules.md](../04-business-rules/sale-rules.md) — BR-SALE-020
- [../05-casebook/sale-cases.md](../05-casebook/sale-cases.md) — CASE-SALE-013
- [../00-product/validation-plan.md](../00-product/validation-plan.md) — the session this is asked in
