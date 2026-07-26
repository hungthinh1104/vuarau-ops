# Sale business rules

A **sale** is a completed wholesale transaction: goods handed over, quantity and
price agreed. It is not a future order and not a request for delivery — those are
a separate concept (`CustomerOrder`) that this phase does not model
([glossary](../01-domain/glossary.md)).

Each rule has a stable ID, a risk class, the rejection code it produces, and the
test that proves it. IDs are never reused; a superseded rule is marked deprecated,
not deleted. Every rule here is implemented and carries a test. `pnpm trace:check` reports the
planned count on every run; it is currently zero.

Historical note: BR-SALE-001…009 were called BR-ORDER-001…009 until the
terminology was closed. Same rules, same numbers, new vocabulary
([retired identifiers](../02-use-cases/use-case-catalog.md)).

---

## Draft

### BR-SALE-010 — A draft sale has no financial effect

**Risk:** P0 · **Code:** — · **Tests:** TC-SALE-014 · **Cases:** CASE-SALE-001

A draft writes a `sales` row and nothing else. No customer account entry, no
balance movement, no change to what anybody owes.

This is what makes the draft safe to be wrong. A worker mid-typing has entered
half a load at a guessed price; if that moved a balance, every correction would
need a compensating entry and the account timeline would fill with noise that
describes typing rather than trade.

Stated as its own P0 rule rather than left implicit in "posting creates the
entry", because the failure mode — a draft that quietly moves money — is silent,
and the assertion that catches it is one line.

---

### BR-SALE-003 — Every line must have a valid product, quantity, unit and price

**Risk:** P1 · **Code:** `SALE_LINE_INVALID` · **Tests:** TC-SALE-007

Concretely: `productId` present, `productName` non-blank,
`quantity.valueScaled > 0`, `quantity.unit` in the unit enum,
`unitPrice.amountMinor ≥ 0`.

Zero is a legal unit price — depots give things away — but a negative one is not;
that is a discount, and discounts are not modelled in this phase.

The rejection carries `details.lineIndex` and `details.lineId` so the UI can point
at the offending row instead of saying "something is wrong".

---

### BR-SALE-009 — All line currencies must match the sale currency

**Risk:** P1 · **Code:** `SALE_CURRENCY_MISMATCH` · **Tests:** TC-SALE-010

Only VND exists today, so this rule is unreachable in practice. It is implemented
anyway because the moment a second currency is added, silently summing mixed
currencies into one total is a P0 money bug, and the guard is three lines.

---

### BR-SALE-018 — A draft may be edited or discarded; a posted sale may not

**Risk:** P1 · **Codes:** `SALE_ALREADY_POSTED`, `SALE_ALREADY_DISCARDED` · **Tests:** TC-SALE-019, TC-SALE-020 · **Cases:** CASE-SALE-009

`UpdateSaleDraft` replaces the line set of a `draft` sale **wholesale** and bumps
the version. A per-line patch would need a merge rule for two workers editing the
same draft, and any merge rule produces a total neither of them typed; whole
replacement plus `expectedVersion` means one wins and the other reloads.

`DiscardSaleDraft` marks it `discarded`. Both refuse a `posted` sale with
`SALE_ALREADY_POSTED` — BR-SALE-008 seen from the command side — and a discarded
one with `SALE_ALREADY_DISCARDED`.

Discard is a lifecycle value, not a deletion: the draft row and its lines stay,
because "somebody entered this and then thought better of it" is information, and
because a discarded draft resubmitted by an offline client must be recognised as a
replay rather than accepted as new (BR-COMMAND-001).

Neither has any account effect. A draft moves no money however many times it is
edited, and discarding one moves none either (BR-SALE-010).

`PostSale` refuses a discarded draft explicitly. The repository's
`status = 'draft'` condition would refuse the write anyway — but as a version
conflict, which is the wrong story to tell somebody who is looking at a draft that
was thrown away.

---

## Posting

### BR-SALE-001 — Sale total equals the sum of its line totals

**Risk:** P0 · **Code:** — · **Tests:** TC-SALE-001 · **Cases:** CASE-SALE-001

`sale.totalAmount.amountMinor = Σ line.lineTotal.amountMinor`, recomputed by the
domain on every write. The client's arithmetic is never trusted, and no code path
stores a total that was not produced by this sum.

---

### BR-SALE-004 — Line total rounding is half-up on the minor unit

**Risk:** P0 · **Code:** — · **Tests:** TC-SALE-002 · **Cases:** CASE-SALE-001

```
lineTotal = roundHalfUp(quantity.valueScaled × unitPrice.amountMinor / 1000)
```

Quantities are integers in milli-units (1.5 kg → `1500`), prices are integers in
đồng. The division by 1000 is the only place a fraction can appear, and it is
resolved by half-up rounding — the convention a Vietnamese market trader uses by
hand.

Worked example: 1.5 kg at 12.345 ₫/kg → `1500 × 12345 / 1000 = 18517.5` → **18.518 ₫**.

This rule is P0 because it is the single arithmetic step between a worker's input
and a customer's balance. It is tested with exact expected integers, including
half-way values, never with floating-point tolerance.

---

### BR-SALE-002 — A sale cannot be posted without at least one line

**Risk:** P1 · **Code:** `SALE_EMPTY` · **Tests:** TC-SALE-006 · **Cases:** CASE-SALE-002

A draft _may_ be empty — the worker is still typing. Posting an empty sale would
create a receivable of 0 ₫ and a completed sale of nothing.

---

### BR-SALE-011 — Posting snapshots the final name, quantity, unit and unit price

**Risk:** P0 · **Code:** — · **Tests:** TC-SALE-015 · **Cases:** CASE-SALE-001

Posting means the accepted quantity and the agreed price are now known. Those four
values are frozen onto the sale line and never read from the product catalogue
again.

A depot revises prices daily and renames products ("cà chua" → "cà chua Đà Lạt").
Without the snapshot, last week's receivable would silently follow this week's
price list, and a customer disputing an amount would be shown a number that did
not exist when they bought (ASM-008).

The snapshot is taken at draft entry and **re-affirmed** at posting, because a
draft may have sat overnight and the numbers finally agreed are the ones in the
row at the moment of posting — not necessarily the ones typed first.

---

### BR-SALE-007 — Posting produces exactly one customer account entry

**Risk:** P0 · **Code:** — · **Tests:** TC-SALE-003, TC-SALE-012 · **Cases:** CASE-SALE-005, CASE-ACCOUNT-001

One entry, `amount = +sale.totalAmount`, `sourceType = sale_posting`,
`sourceId = saleId`, `transactionTime = command.occurredAt`.

Not zero (the receivable would be lost), not two (the customer would owe double).
This is the rule the "post twice over a flaky connection" scenario is really
about, and it is enforced three times over: the idempotency layer answers the
retry, the domain refuses a second posting, and `UNIQUE (source_type, source_id)`
makes a duplicate entry unrepresentable even if both of those were wrong.

---

### BR-SALE-005 — A posted sale cannot be posted again

**Risk:** P1 · **Code:** `SALE_ALREADY_POSTED` · **Tests:** TC-SALE-008 · **Cases:** CASE-SALE-003

A _replay of the same command_ is not a second posting; it is intercepted by the
idempotency layer before the domain runs (BR-COMMAND-001). This rule catches the
other case: a person genuinely pressing post on an already-posted sale.

---

### BR-SALE-006 — Posting with a stale version is refused

**Risk:** P0 · **Code:** `SALE_VERSION_CONFLICT` · **Tests:** TC-SALE-005 · **Cases:** CASE-SALE-004

If `command.expectedVersion ≠ sale.version`, the command is refused with both
values in `details`. Two workers editing the same sale on two phones must not have
one silently overwrite the other's lines and post a total that neither intended.

The version is checked **before** the already-posted check: if somebody else has
already posted this sale, "someone changed this while you were looking at it" is a
more truthful answer than "already posted", and it points the worker at reloading
rather than at retrying.

---

### BR-SALE-017 — A due date is optional, and without one nothing is overdue

**Risk:** P1 · **Code:** — · **Tests:** TC-SALE-018 · **Cases:** CASE-SALE-012

`sale.dueAt` is nullable. When it is null the sale carries no payment term, and no
read, report, or classification may describe the resulting receivable as overdue.

Depots sell on open account far more often than on terms. Treating "no stated due
date" as "due immediately" would put most customers on a chase list the day they
buy, which is not what anybody agreed. Aging — _how old_ is this balance — stays
computable from `transactionTime` and needs no due date; **overdue** is a judgement
about a promise, and where there is no promise there is nothing to break.

This rule fixes the boundary of ASM-016 rather than closing it: what payment terms
mean, and whether a depot wants them at all, still needs the owner.

---

## Correction

### BR-SALE-008 — A posted sale and its lines are immutable

**Risk:** P0 · **Code:** `SALE_IMMUTABLE` · **Tests:** TC-SALE-009, TC-SALE-016 · **Cases:** CASE-SALE-007

Once posted, no command updates or deletes the `sales` row or any `sale_lines`
row. No update or delete path exists in the repository for a posted sale, and a
Postgres trigger raises on `UPDATE` and `DELETE` for both tables.

Voiding does **not** violate this: it appends a `sale_voids` record and a
compensating account entry, and leaves the original untouched. The sale's
financial state — `active` or `voided` — is _derived_ from whether such a record
exists, which is exactly why it is not a column something has to keep true
([state catalog](../03-state-machines/state-catalog.md)).

---

### BR-SALE-012 — Voiding creates exactly one full compensating account entry

**Risk:** P0 · **Code:** — · **Tests:** TC-SALE-021, TC-SALE-022 · **Cases:** CASE-SALE-008

One entry, `amount = −sale.totalAmount`, `sourceType = sale_void`,
`sourceId = saleVoidId`, so that posting and void sum to exactly zero for that
sale.

Full, never partial. A sale for the wrong amount is not corrected by voiding part
of it; it is voided whole and replaced by a correct one (BR-SALE-016). Partial
voiding would create a third notion of "what this sale was for", alongside the
posted total and the replacement, and none of the three would be authoritative.

The compensation is computed from the **stored** posted total, never from anything
the caller sends, so a void cannot be used to move an arbitrary amount. Moving an
arbitrary amount is what `AdjustCustomerDebt` is for, and it needs a different
permission (BR-AUTH-006).

---

### BR-SALE-013 — A voided sale cannot be voided again

**Risk:** P0 · **Code:** `SALE_ALREADY_VOIDED` · **Tests:** TC-SALE-023, TC-SALE-024 · **Cases:** CASE-SALE-010

Guarded at three levels, because a second void would credit a customer twice for
one mistake:

1. the idempotency layer replays an identical retry without re-executing it;
2. the domain refuses when a void record already exists, having read the sale
   `FOR UPDATE`, which serialises two concurrent attempts;
3. `UNIQUE (sale_id)` on `sale_voids` makes the second insert fail even if the
   first two were somehow bypassed.

Level 3 is the one that holds under a concurrency bug nobody predicted, which is
why it exists despite levels 1 and 2 being sufficient in theory.

---

### BR-SALE-015 — Only a posted sale can be voided

**Risk:** P1 · **Code:** `SALE_NOT_POSTED` · **Tests:** TC-SALE-025 · **Cases:** CASE-SALE-010

Voiding a draft is meaningless: a draft has no financial effect to compensate
(BR-SALE-010). The remedy for an unwanted draft is `DiscardSaleDraft`
(BR-SALE-018), and a separate code says so rather than leaving the worker to
guess.

---

### BR-SALE-014 — Voiding requires a structured reason code and an explanation

**Risk:** P1 · **Code:** `SALE_VOID_REASON_REQUIRED` · **Tests:** TC-SALE-026 · **Cases:** CASE-SALE-008

Both are mandatory: a `reasonCode` from a fixed list, and free text that is not
blank after trimming.

| `reasonCode`            | When                                                  |
| ----------------------- | ----------------------------------------------------- |
| `wrong_amount`          | Quantity or price was entered incorrectly             |
| `wrong_customer`        | Recorded against the wrong account                    |
| `goods_returned`        | Customer returned the load, or refused it on delivery |
| `duplicate_entry`       | The same sale was recorded twice                      |
| `cancelled_by_customer` | Agreed off before the goods moved                     |
| `other`                 | Anything else — the free text carries the meaning     |

The code is what a report can group by; the text is what the person disputing the
balance six months later actually needs. A void with only a code produces reports
nobody can act on; a void with only text produces a list nobody can count.

Free text is stored verbatim and never parsed.

---

### BR-SALE-016 — A replacement sale links to the sale it replaces

**Risk:** P2 · **Code:** `SALE_NOT_FOUND` · **Tests:** TC-SALE-027 · **Cases:** CASE-SALE-011

A corrected sale is a **new** sale carrying `replacesSaleId`. The link is set once
at draft creation and never rewritten; the voided sale is not modified to point
forward, because that would be an update to a posted row (BR-SALE-008).

The link is optional, and a void is valid without one. A load that was returned is
voided and never replaced; a load priced wrongly is voided and replaced. Requiring
a replacement would invent a sale that never happened.

Consequence, stated plainly: following the chain backwards is one lookup, forwards
is a scan of `replaces_sale_id`. Reads are the cheap direction to improve later; an
immutable row rewritten is not.

---

## Deprecated rules

| Retired      | Superseded by | Change                                        |
| ------------ | ------------- | --------------------------------------------- |
| BR-ORDER-001 | BR-SALE-001   | Renamed only — substance unchanged            |
| BR-ORDER-002 | BR-SALE-002   | Renamed only                                  |
| BR-ORDER-003 | BR-SALE-003   | Renamed only                                  |
| BR-ORDER-004 | BR-SALE-004   | Renamed only                                  |
| BR-ORDER-005 | BR-SALE-005   | Renamed only                                  |
| BR-ORDER-006 | BR-SALE-006   | Renamed only                                  |
| BR-ORDER-007 | BR-SALE-007   | Ledger renamed to the customer account ledger |
| BR-ORDER-008 | BR-SALE-008   | Strengthened: "never deleted" → "immutable"   |
| BR-ORDER-009 | BR-SALE-009   | Renamed only                                  |

The old identifiers are recorded so nothing reissues them; the full mapping across
every artefact type is in the
[use-case catalog](../02-use-cases/use-case-catalog.md).

## Related

- [../02-use-cases/sale-use-cases.md](../02-use-cases/sale-use-cases.md), [../02-use-cases/UC-SALE-002-post-sale.md](../02-use-cases/UC-SALE-002-post-sale.md)
- [../03-state-machines/sale-state-machine.md](../03-state-machines/sale-state-machine.md)
- [../05-casebook/sale-cases.md](../05-casebook/sale-cases.md)
- [customer-account-rules.md](customer-account-rules.md), [error-code-catalog.md](error-code-catalog.md)
