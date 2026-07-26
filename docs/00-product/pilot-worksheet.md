# Pilot worksheet — 15–20 transactions

**This sheet is empty on purpose. Do not fill it in with expected values.**

It exists to settle H2 — _a worker can record a real multi-line sale faster than
the current paper/memory process_ — which no test in this repository can answer.
Automated results say nothing about it and must not be entered here.

Read [validation-plan.md](validation-plan.md) before running a session.

---

## Before you start

- [ ] A workspace containing **the worker's own customers**. Not seeded demo
      data — recognising a name is most of the speed, and a stranger's list
      measures reading, not recording.
- [ ] The worker's own phone, on their own connection.
- [ ] A stopwatch. Do not use the app's own timings; they start when the screen
      opens, and the worker starts before that.
- [ ] Somebody to write, who is not the person operating anything.

Do **not** demonstrate the screen first. A demonstrated screen measures how well
somebody copies what they were shown.

## The two questions after every task

Ask these and nothing else. Do not explain, and do not correct a wrong answer
until the sheet is filled in.

1. _"Khách này giờ nợ bao nhiêu?"_ — do they read the balance correctly?
2. _"Đơn này đã ghi vào sổ chưa?"_ — do they know draft from posted?

---

## The sheet

One row per transaction. Fifteen is the minimum; twenty is better.

| #   | Transaction shape | Lines | Time (s) | Mistakes | Corrections | Hesitations | Words they used | Missing information | Trusted the balance? |
| --- | ----------------- | ----- | -------- | -------- | ----------- | ----------- | --------------- | ------------------- | -------------------- |
| 1   |                   |       |          |          |             |             |                 |                     |                      |
| 2   |                   |       |          |          |             |             |                 |                     |                      |
| 3   |                   |       |          |          |             |             |                 |                     |                      |
| 4   |                   |       |          |          |             |             |                 |                     |                      |
| 5   |                   |       |          |          |             |             |                 |                     |                      |
| 6   |                   |       |          |          |             |             |                 |                     |                      |
| 7   |                   |       |          |          |             |             |                 |                     |                      |
| 8   |                   |       |          |          |             |             |                 |                     |                      |
| 9   |                   |       |          |          |             |             |                 |                     |                      |
| 10  |                   |       |          |          |             |             |                 |                     |                      |
| 11  |                   |       |          |          |             |             |                 |                     |                      |
| 12  |                   |       |          |          |             |             |                 |                     |                      |
| 13  |                   |       |          |          |             |             |                 |                     |                      |
| 14  |                   |       |          |          |             |             |                 |                     |                      |
| 15  |                   |       |          |          |             |             |                 |                     |                      |
| 16  |                   |       |          |          |             |             |                 |                     |                      |
| 17  |                   |       |          |          |             |             |                 |                     |                      |
| 18  |                   |       |          |          |             |             |                 |                     |                      |
| 19  |                   |       |          |          |             |             |                 |                     |                      |
| 20  |                   |       |          |          |             |             |                 |                     |                      |

### What goes in each column

| Column                   | What to write                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| **Transaction shape**    | Sale, payment, or both. Whether it was back-dated. Whether the customer was new                     |
| **Lines**                | How many, for a sale                                                                                |
| **Time (s)**             | First tap to the posted sale being on screen. Say nothing during it                                 |
| **Mistakes**             | Every wrong entry, including ones they fixed without comment                                        |
| **Corrections**          | What they did about it, and whether the software helped or was in the way                           |
| **Hesitations**          | Where they stopped, what they looked at, what they scrolled hunting for                             |
| **Words they used**      | Verbatim, in Vietnamese. If they say "ghi sổ" where the screen says "chốt đơn", the screen is wrong |
| **Missing information**  | Anything they looked for and did not find, including things they asked out loud                     |
| **Trusted the balance?** | Their answer to the two questions above, and whether it was right                                   |

---

## Session summary

Fill in only after every row is written. Report the median **with the range** —
an average hides the one 90-second transaction that is the whole finding.

```text
transactions recorded:            ___
one-line sales:   median ___ s    range ___–___ s     target: median < 10 s
three-line sales: median ___ s    range ___–___ s     target: median < 25 s

duplicate financial effects:                 ___     target: 0
entries lost after a recoverable failure:    ___     target: 0
tasks where draft vs posted was understood:  ___/___ target: all
tasks where the balance was understood:      ___/___ target: all
```

The zero targets are absolute. One duplicated receivable in twenty is a failure,
not a 95% pass — a depot that finds a phantom debt stops trusting every other
number in the book.

### The three findings

Not a list of everything. The three things that would change what gets built next.

```text
1.
2.
3.
```

### What the worker would go back to paper for

The most useful question in the session, and the one most likely to be left out
because the answer is uncomfortable.

```text

```

## Related

- [validation-plan.md](validation-plan.md) — how the session is run, and why
- [product-brief.md](product-brief.md) — the hypotheses this settles
