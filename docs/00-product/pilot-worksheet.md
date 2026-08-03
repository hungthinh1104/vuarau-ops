# Pilot worksheet — 15–20 transactions

For M23, this H2 sheet is subordinate to the frozen
[H2–H6 field-validation protocol](field-validation-protocol.md). Every copy
must carry the full release SHA and the assistance, independent-reference,
canonical-final-state and incident fields defined there.

**This sheet is empty on purpose. Do not fill it in with expected values.**

It exists to settle H2 — _a worker records a real multi-line sale accurately,
unaided, within the target time_ — which no test in this repository can answer.
Automated results say nothing about it and must not be entered here.

Read [validation-plan.md](validation-plan.md) before running a session. It says
what each column is for and, in _What H2 deliberately does not claim_, what this
sheet must not be used to argue.

---

## Before you start

- [ ] A workspace containing **the worker's own customers**. Not seeded demo
      data — recognising a name is most of the speed, and a stranger's list
      measures reading, not recording.
- [ ] The worker's own phone, on their own connection.
- [ ] A stopwatch. Do not use the app's own timings; they start when the screen
      opens, and the worker starts before that.
- [ ] Somebody to write, who is not the person operating anything.
- [ ] The four questions in the
      [ASM-002 worksheet](../09-decisions/ASM-002-debt-recognition-worksheet.md),
      put to the **owner** before the first sale is recorded.

Do **not** demonstrate the screen first. A demonstrated screen measures how well
somebody copies what they were shown.

## The order of one transaction

1. They record it **their normal way** — notebook, phone note, whatever they use.
   Time it. Do not present this as a race; they were going to write it down
   anyway, and this copy is what the app's version gets checked against.
2. They record it **in the app**. Time from first tap to the posted sale on
   screen. Say nothing during it.
3. Compare the two, field by field: customer, each line's item, quantity, unit,
   price, and the total.
4. Ask the two questions below. Ask these and nothing else. Do not explain, and do
   not correct a wrong answer until the sheet is filled in.
   - _"Khách này giờ nợ bao nhiêu?"_ — do they read the balance correctly?
   - _"Đơn này đã ghi vào sổ chưa?"_ — do they know draft from posted?

---

## Sheet A — what was measured

One row per transaction. Fifteen is the minimum; twenty is better.

| #   | Shape | Lines | Their way (s) | App (s) | Errors | Assistance | Draft vs posted | Balance |
| --- | ----- | ----- | ------------- | ------- | ------ | ---------- | --------------- | ------- |
| 1   |       |       |               |         |        |            |                 |         |
| 2   |       |       |               |         |        |            |                 |         |
| 3   |       |       |               |         |        |            |                 |         |
| 4   |       |       |               |         |        |            |                 |         |
| 5   |       |       |               |         |        |            |                 |         |
| 6   |       |       |               |         |        |            |                 |         |
| 7   |       |       |               |         |        |            |                 |         |
| 8   |       |       |               |         |        |            |                 |         |
| 9   |       |       |               |         |        |            |                 |         |
| 10  |       |       |               |         |        |            |                 |         |
| 11  |       |       |               |         |        |            |                 |         |
| 12  |       |       |               |         |        |            |                 |         |
| 13  |       |       |               |         |        |            |                 |         |
| 14  |       |       |               |         |        |            |                 |         |
| 15  |       |       |               |         |        |            |                 |         |
| 16  |       |       |               |         |        |            |                 |         |
| 17  |       |       |               |         |        |            |                 |         |
| 18  |       |       |               |         |        |            |                 |         |
| 19  |       |       |               |         |        |            |                 |         |
| 20  |       |       |               |         |        |            |                 |         |

| Column              | What to write                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shape**           | Sale, payment, or both. Whether it was back-dated. Whether the customer was new                                                                                |
| **Lines**           | How many, for a sale. This is what decides which timing target the row is judged against                                                                       |
| **Their way (s)**   | How long their normal recording took. **Context, never a comparison** — see the confounds in [validation-plan.md](validation-plan.md). Its real job is Sheet B |
| **App (s)**         | First tap to the posted sale on screen. Say nothing during it                                                                                                  |
| **Errors**          | Count of wrong entries, **including ones they fixed without comment**. A field corrected before posting is still an error the design caused                    |
| **Assistance**      | `none` · `prompted` (you answered a question) · `taken over` (you touched the phone or said which control to press). Only _taken over_ fails the task          |
| **Draft vs posted** | ✓ or ✗ — their answer to _"Đơn này đã ghi vào sổ chưa?"_, and whether it was right                                                                             |
| **Balance**         | ✓ or ✗ — their answer to _"Khách này giờ nợ bao nhiêu?"_, and whether it was right                                                                             |

**Zero is a real answer.** An empty Errors cell means nobody looked; write `0`.

## Sheet B — was it the right sale

The accuracy check, kept separate because it is the one that is skipped when a
session runs late — and it is the one that decides whether speed meant anything.

| #   | Matches their record? | What differed | Would they have noticed? |
| --- | --------------------- | ------------- | ------------------------ |
| 1   |                       |               |                          |
| 2   |                       |               |                          |
| 3   |                       |               |                          |
| 4   |                       |               |                          |
| 5   |                       |               |                          |

_Continue for every transaction. Only rows that differ need the last two columns._

| Column                       | What to write                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Matches their record?**    | ✓ or ✗, comparing customer, each line, quantity, unit, price, total                                                         |
| **What differed**            | The exact fields. "Total was 720.000 in the app, 702.000 in the book" — not "small difference"                              |
| **Would they have noticed?** | Ask them, after they have seen it. A difference the worker spots is a usability problem; one they do not is a trust problem |

## Sheet C — what was observed

| #   | Corrections | Hesitations | Words they used | Missing information |
| --- | ----------- | ----------- | --------------- | ------------------- |
| 1   |             |             |                 |                     |
| 2   |             |             |                 |                     |
| 3   |             |             |                 |                     |
| 4   |             |             |                 |                     |
| 5   |             |             |                 |                     |

_Continue for every transaction._

| Column                  | What to write                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| **Corrections**         | What they did about a mistake, and whether the software helped or was in the way                    |
| **Hesitations**         | Where they stopped, what they looked at, what they scrolled hunting for                             |
| **Words they used**     | Verbatim, in Vietnamese. If they say "ghi sổ" where the screen says "chốt đơn", the screen is wrong |
| **Missing information** | Anything they looked for and did not find, including things they asked out loud                     |

---

## Session summary

Fill in only after every row is written. Report the median **with the range** — an
average hides the one 90-second transaction that is the whole finding.

```text
transactions recorded:            ___
one-line sales:   median ___ s    range ___–___ s     target: median < 10 s
three-line sales: median ___ s    range ___–___ s     target: median < 25 s

recorded sale matched their own record:      ___/___ target: all
tasks the facilitator had to take over:      ___     target: 0
tasks with a prompt (counted, not scored):   ___     no target
duplicate financial effects:                 ___     target: 0
entries lost after a recoverable failure:    ___     target: 0
tasks where draft vs posted was understood:  ___/___ target: all
tasks where the balance was understood:      ___/___ target: all

their normal recording, for context only:    median ___ s   range ___–___ s
```

The zero targets are absolute. One duplicated receivable in twenty is a failure,
not a 95% pass — a depot that finds a phantom debt stops trusting every other
number in the book.

**The last line is not a result.** It is not compared to the app timing, in this
document or in any summary of it. The reasons are in
[validation-plan.md](validation-plan.md), and they are not a formality: the worker
records it first, so the app is timed on a job half-done, and they have twenty
years of practice on one side and twenty minutes on the other.

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

### ASM-002 — answered?

```text
☐ The four questions were put to the owner, and the worksheet is signed
☐ Answer: ☐ chốt đơn   ☐ delivery   ☐ invoicing   ☐ other

If anything other than chốt đơn: stop before any further real sale is recorded.
```

## Related

- [validation-plan.md](validation-plan.md) — how the session is run, and why
- [pilot-mode.md](pilot-mode.md) — what this pilot is, and what it must not be used for
- [product-brief.md](product-brief.md) — the hypotheses this settles
- [../09-decisions/ASM-002-debt-recognition-worksheet.md](../09-decisions/ASM-002-debt-recognition-worksheet.md) — the owner's four questions
