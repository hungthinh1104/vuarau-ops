# Read casebook

---

### CASE-READ-001 — Paging the day's sales while a worker posts another

**Situation.** The owner opens the sales list at the end of the day and pages
through it two at a time. While they are on page one, a worker at the bay posts
another sale — back-dated to that morning, because that is when it happened.

**Expected.** Page two continues from where page one stopped, and contains none of
the rows page one showed. The new sale appears wherever its business time places
it, or not at all if that position has already been passed.

The keyset boundary is `(transactionTime, id)` of the last row handed out, so an
insert anywhere else in the ordering cannot move it. With `OFFSET 2` the same
insert would shift every subsequent row by one and hand the owner a sale they had
already seen — and with money on the screen, "did I count this twice?" is a
question with no good answer.

**Rules.** BR-READ-001 · **Tests.** TC-READ-004

---

### CASE-READ-002 — Finding "Cô Hoà" by typing "co hoa"

**Situation.** A worker at the loading bay needs Cô Hoà's account. They are on a
phone, one-handed, with a Vietnamese keyboard they are not using because it is
faster to type without tones.

**Expected.** The search matches. Display name and phone are both folded through
`vuarau_fold`, which strips tones **and** maps `đ`/`Đ` to `d` — the letter generic
unaccenting leaves alone and Vietnamese names are full of.

The same folding runs in the in-memory adapter, so search behaves identically in a
test and against Postgres. A fold that only existed in SQL would make every
application test a poor predictor of the thing users actually do.

**Rules.** BR-READ-001 · **Tests.** TC-READ-002

---

### CASE-READ-003 — Reading a customer's account after a sale was voided

**Situation.** A customer disputes their balance. The owner opens the account
timeline.

**Expected.** Every entry, including both halves of the compensating pair:
`+875 000` for the posting and `−875 000` for the void, each with the balance after
it and each naming the sale it came from. Nothing is hidden and nothing is netted.

Hiding the pair would leave a timeline whose arithmetic cannot be followed — the
balance would change with no visible cause — and the timeline exists precisely to
be followable when somebody is arguing about the number.

**Rules.** BR-READ-003, BR-ACCOUNT-005 · **Tests.** TC-READ-006

---

## Related

- [../04-business-rules/read-rules.md](../04-business-rules/read-rules.md)
- [../06-api-contracts/read-models.md](../06-api-contracts/read-models.md)
