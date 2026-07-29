# Validation plan

How the integration and field hypotheses get settled, and what would count as
settling them.

```text
H1 — frontend commands integrate safely with the real backend
H2 — a worker records a real multi-line sale accurately, unaided, within the
     target time
H3 — a warehouse worker records Receiving accurately
H4 — warehouse and delivery workers record Dispatch and Return safely
H5 — an owner explains customer, supplier and inventory totals
H6 — an owner exports and restores without developer assistance
```

The hypotheses need different evidence, and conflating them is the failure this
document exists to prevent. **A green test suite is technical evidence for H1 and
prerequisite evidence for the other workflows; it is not field validation.** No
count of passing tests may be reported as product validation.

> **H2 was reworded on 2026-07-27.** It previously read _"a worker can record a
> real multi-line sale **faster than the current paper/memory process**"_. That
> is a causal comparison, and the session that was designed to settle it could
> not have — nothing measured the current process. The claim and the evidence are
> now the same size. [Why, in full](#what-h2-deliberately-does-not-claim).

---

## H1 — integration safety

Settled by automated tests against a **real API process and a real PostgreSQL
database**, not fixtures. A mocked happy path proves that the mock was written to
match the component, which nobody doubted.

| Field                   | Value                                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Task**                | Record a payment, and post a multi-line sale, through the browser against a live server                                                                                     |
| **Expected user**       | Any active member — the tests run as `sales` and as `warehouse`, because the interesting answers differ by role                                                             |
| **Test data**           | The development seed: one workspace, five actors (one per role), three customers                                                                                            |
| **Timing metric**       | None. H1 is about correctness; timing belongs to H2                                                                                                                         |
| **Observed errors**     | Every rejection the workflow can reach, asserted by code — `SALE_EMPTY`, `SALE_LINE_INVALID`, `PERMISSION_DENIED`, `SALE_VERSION_CONFLICT`, `WORKSPACE_MEMBERSHIP_INACTIVE` |
| **User wording**        | Not applicable                                                                                                                                                              |
| **Missing information** | Recorded as a gap in this document rather than worked around in a test                                                                                                      |
| **Pass/fail criterion** | See below. All must hold; any one failing fails H1                                                                                                                          |

### H1 pass criteria

```text
1. A payment recorded through the UI appears in account.timeline with the
   same amount, and moves the balance by exactly that amount.
2. A duplicate tap produces exactly one account entry.
3. A dropped connection followed by a resend produces exactly one account entry,
   and the resend carries the original commandId and idempotencyKey.
4. A posted sale creates exactly one account entry of +total, and no more.
5. A control the caller's role forbids is disabled before it is pressed, and
   refused with PERMISSION_DENIED if pressed anyway.
6. A stale draft is refused with a version conflict and offers reload, never a
   silent retry.
7. Entered data survives every recoverable failure above.
8. No fixture data is reachable from a production route.
```

Where each is asserted is in [../08-qa/trace-map.yml](../08-qa/trace-map.yml) under
`TC-WEB-*`. The Playwright suite runs against a real API and skips — loudly, never
silently — when `DATABASE_URL` is unset.

### What H1 cannot tell us

That the numbers on screen are the numbers a depot would recognise. A test asserts
that 875.000 ₫ arrived; only a person can say whether that was the load they sold.

---

## H2 — accurate, unaided, in the time it should take

Settled by watching **15–20 real transactions** with a real worker, on their own
phone. Nothing in this repository can settle it, and this plan does not pretend
otherwise.

Four things have to be true at once, and each is recorded separately because each
fails on its own:

```text
accurate    the sale in the system is the sale they made
unaided     they got there without the facilitator taking over
in time     median inside the target for that shape of sale
understood  they can say what state it is in and what the customer now owes
```

| Field                   | Value                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Task**                | Record the sale you just made, the way you would normally record it                                                                                                            |
| **Expected user**       | A depot worker or owner, roughly 40–60, who currently uses paper or memory. Not somebody who has seen the software before                                                      |
| **Test data**           | Their own customers and their own loads. Seeded demo data invalidates the timing — recognising a name is most of the speed                                                     |
| **Timing metric**       | Wall clock from "starts entering" to "sees the posted sale". Median across the session, reported with the range, never as an average that one 90-second fumble disappears into |
| **Observed errors**     | Every mistake, correction and re-entry, with what caused it. A mistake the worker fixed without comment still counts                                                           |
| **User wording**        | Their words for what they are doing, verbatim and in Vietnamese. If they say "ghi sổ" where the screen says "chốt đơn", the screen is wrong                                    |
| **Missing information** | Anything they looked for and did not find, including things they asked out loud and things they scrolled hunting for                                                           |
| **Accuracy reference**  | Their own record of the same sale — the notebook page, the message, whatever they normally write. The system's version is checked against theirs, never against itself         |
| **Assistance**          | Three levels: **none**, **prompted** (a question answered), **taken over** (the facilitator touched the phone or said which control to press)                                  |
| **Pass/fail criterion** | See the targets below                                                                                                                                                          |

### H2 targets

Pilot targets, not claims. They are written down before the pilot so that a
disappointing result cannot be reinterpreted afterwards.

```text
one-line sale:                                  median under 10 seconds
three-line sale:                                median under 25 seconds
recorded sale matches the worker's own record:  every task
tasks where the facilitator had to take over:   zero
duplicate financial effects:                    zero
lost entered data after a recoverable failure:  zero
draft correctly distinguished from posted:      every task
resulting balance correctly read:               every task
```

The two timings come from the product brief's "a worker records a sale in under
ten seconds". The two comprehension targets are the ones that would stop the
product: somebody who cannot tell a draft from a posted sale will eventually think
they charged a customer and did not, and somebody who misreads the resulting
balance will collect the wrong amount.

**Accuracy is the target that was missing.** A sale entered in six seconds with the
wrong quantity is worse than no sale at all — it is a wrong number that looks
confident, and that nobody has any reason to re-check. It is checked against the
worker's own record of the same transaction, because that is the only independent
statement of what was actually sold.

**"Prompted" is counted, not scored.** How many questions a first-time user may ask
is not a threshold anybody can honestly set in advance, so the count is reported
and read rather than passed or failed. Only _taken over_ fails a task: at that
point the facilitator recorded the sale, and the session measured the facilitator.

The zero targets are absolute. One duplicated receivable in twenty transactions is
a failure, not a 95% pass — a depot that finds a phantom debt stops trusting every
other number in the book.

### What H2 deliberately does not claim

H2 used to say **faster than the current paper/memory process**. It no longer does,
and the reason is not caution: the session was never capable of supporting the word
"faster". Nothing measured the current process. A stopwatch on the app and no
stopwatch on the notebook produces one number, and one number is not a comparison.

The obvious repair — time the notebook too — is worth understanding, because it is
weaker than it looks:

- **Order confounds it.** The worker writes the sale down first, the way they
  always have. By the time they open the app, the quantities are settled and the
  price is recalled. The app is timed on a task the notebook has already done half
  of.
- **Practice confounds it the other way.** They have used the notebook for twenty
  years and the app for twenty minutes.
- **The transactions are not matched.** Fifteen to twenty transactions inside one
  person, each a different shape, is not a sample any comparison survives.

Those confounds do not cancel. They have unknown signs and unknown sizes, and a
median that came out favourable would be repeated as "faster than paper" by
everybody who read only the headline.

So the comparison is not drawn. **A design that could support it** would need
matched transaction pairs, counterbalanced order across sessions, a practice block
before timing starts, and more than one worker — a study, not a pilot session. If
the question ever becomes load-bearing for a decision, that is what it costs, and
nothing in this plan approximates it.

The worker's own record is still taken on every row, for the better reason above:
it is the accuracy reference. Its **time** is written down as context — what a
normal recording costs today, in their hands — and read as context. No target is
set against it, and no comparison is drawn from it.

### How to run it

The worksheet is [pilot-worksheet.md](pilot-worksheet.md), one row per
transaction. It is empty on purpose. **Do not fill it in with expected values.**

1. Set up a workspace with the worker's own customers, following
   [pilot-onboarding.md](pilot-onboarding.md). Do not seed demo data.
2. Ask them to record a sale they have actually just made, in their own way. Do
   not demonstrate the screen first; a demonstrated screen measures how well they
   copy, not whether they can use it.
3. Let them record it their normal way first, and time that too. Do not present it
   as a race — it is the reference copy of what was sold, and they were going to
   write it down anyway.
4. Time from first tap to the posted sale being visible. Say nothing during it.
5. Write their wording down as they say it, not a tidied version.
6. When the task is done, compare the posted sale against their own record field by
   field, then ask two questions and nothing else:
   - _"Khách này giờ nợ bao nhiêu?"_ — do they read the balance correctly?
   - _"Đơn này đã ghi vào sổ chưa?"_ — do they know draft from posted?
7. Record what happened, including the transactions that went badly. Especially
   those.

**Once per pilot, not once per transaction:** put the four questions in the
[ASM-002 worksheet](../09-decisions/ASM-002-debt-recognition-worksheet.md) to the
depot **owner**, before the first sale is recorded. They decide when a customer
starts owing money, and that answer cannot be recovered from the data afterwards.

---

Before a real posted Sale or confirmed Purchase, also complete the
[ASM-024 worksheet](../09-decisions/ASM-024-post-sale-meaning-worksheet.md) and
[ASM-025 worksheet](../09-decisions/ASM-025-supplier-payable-recognition-worksheet.md).
A usability observation cannot substitute for the owner's recognition decision.

## H3 — accurate Receiving

**Still hypothetical.** Observe a warehouse worker receive real goods against the
depot's independent supplier record.

Pass only when:

```text
Product, unit, quantity and transaction time match the independent record
every receipt and reversal has one source-linked inventory movement
the worker can explain that Receiving changed goods but not supplier payable
no duplicate movement appears after a recoverable retry
no facilitator takes over
```

Record split receipts, weight differences, rejected goods and the worker's own
words. ASM-025 must be answered before interpreting supplier-money results.

## H4 — safe Dispatch and Return

**Still hypothetical.** Observe warehouse and delivery workers dispatch a posted
Sale and record any real return.

Pass only when:

```text
loaded and returned Product/unit quantities match the independent physical record
Dispatch creates one negative movement per line and Return one positive movement
customer debt does not change as a hidden consequence
the worker can distinguish dispatched, delivered and returned facts
retry does not duplicate a movement
no facilitator takes over
```

If a task would make inventory negative, record the event and activate ASM-027's
owner-decision trigger rather than declaring the current default validated.

## H5 — owner explains customer, supplier and inventory totals

**Still hypothetical.** Give the owner three real disputed or non-trivial totals:
one customer balance, one supplier balance and one Product/unit quantity. Do not
tell them which document to open.

Pass only when the owner:

```text
states each total with the correct sign, unit and classification
drills from projection or report to every canonical source needed to explain it
identifies a void, reversal, return or adjustment without developer help
distinguishes transaction time from recorded time
finds no unresolved or unattributable effect
```

Automated reconciliation proves the implementation can compare projections with
canonical history. It cannot prove the owner understands the explanation.

## H6 — owner exports and restores without developer assistance

**Still hypothetical.** In an approved recovery environment, ask the owner to
export a workspace, prepare the documented empty target, restore it, and inspect
integrity and reconciliation results.

Pass only when:

```text
the owner completes the documented path without a developer taking over
the restored workspace reports healthy integrity and consistent reconciliations
canonical source links resolve and command retry history is preserved
repeating the Restore command creates no duplicate canonical rows
the owner can say what is backed up, retained, encrypted and recoverable
```

The final criterion cannot pass until ASM-031 has owned production RPO/RTO,
retention, encryption and restore-drill requirements.

---

## Known gaps and policy gates

Recorded rather than worked around, because a gap a pilot rediscovers is a wasted
session.

| Gap or gate                                                                  | Effect                                                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Reads are not audited (ASM-022)                                              | “Who looked at this balance?” remains unanswerable                                      |
| Role mapping and migrated owners need confirmation (ASM-017/018)             | A field session may expose a capability mismatch; roles must be assigned before go-live |
| Sale and supplier recognition need owner signatures (ASM-024/025)            | Real money entries must not be created until the owner confirms the business event      |
| Delivery cash handling is undefined (ASM-029)                                | Do not pilot driver cash collection before the trigger is resolved                      |
| Sharing/retention and production recovery policy are unwritten (ASM-030/031) | Real-data public sharing and production readiness remain blocked                        |

## Related

- [product-brief.md](product-brief.md) — what the hypotheses are for
- [pilot-worksheet.md](pilot-worksheet.md) — the empty sheet, one row per observed transaction
- [pilot-mode.md](pilot-mode.md) — what kind of pilot this is, and what it may not be used for
- [pilot-onboarding.md](pilot-onboarding.md) — setting the depot up beforehand
- [../08-qa/test-strategy.md](../08-qa/test-strategy.md) — what the automated suites do and do not cover
- [../09-decisions/decision-backlog.md](../09-decisions/decision-backlog.md) — the ASM entries a pilot could settle
- [../09-decisions/ASM-002-debt-recognition-worksheet.md](../09-decisions/ASM-002-debt-recognition-worksheet.md) — the four questions for the owner
- [../09-decisions/ASM-024-post-sale-meaning-worksheet.md](../09-decisions/ASM-024-post-sale-meaning-worksheet.md) — Sale recognition validation
- [../09-decisions/ASM-025-supplier-payable-recognition-worksheet.md](../09-decisions/ASM-025-supplier-payable-recognition-worksheet.md) — supplier recognition validation
- [../09-decisions/ADR-0014-debt-recognition-at-posting.md](../09-decisions/ADR-0014-debt-recognition-at-posting.md) — when a customer starts owing
