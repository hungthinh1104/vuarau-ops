# Order business rules

Each rule has a stable ID, a risk class, the rejection code it produces, and the
test that proves it. IDs are never reused; a superseded rule is marked deprecated,
not deleted.

---

### BR-ORDER-001 — Order total equals the sum of its line totals

**Risk:** P0 · **Code:** — · **Tests:** TC-ORDER-001

`order.totalAmount.amountMinor = Σ line.lineTotal.amountMinor`, recomputed by the
domain on every write. The client's arithmetic is never trusted, and no code path
stores a total that was not produced by this sum.

---

### BR-ORDER-002 — An order cannot be confirmed without at least one line

**Risk:** P1 · **Code:** `ORDER_EMPTY` · **Tests:** TC-ORDER-006 · **Cases:** CASE-ORDER-002

A draft _may_ be empty — the worker is still typing. Confirming an empty order
would create a customer debt of 0 ₫ and a confirmed sale of nothing.

---

### BR-ORDER-003 — Every line must have a valid product, quantity, unit and price

**Risk:** P1 · **Code:** `ORDER_LINE_INVALID` · **Tests:** TC-ORDER-007

Concretely: `productId` present, `productName` non-blank,
`quantity.valueScaled > 0`, `quantity.unit` in the unit enum,
`unitPrice.amountMinor ≥ 0`.

Zero is a legal unit price — depots give things away — but a negative one is not;
that is a discount, and discounts are not modelled in this phase.

The rejection carries `details.lineIndex` and `details.lineId` so the UI can point
at the offending row instead of saying "something is wrong".

---

### BR-ORDER-004 — Line total rounding is half-up on the minor unit

**Risk:** P0 · **Code:** — · **Tests:** TC-ORDER-002

```
lineTotal = roundHalfUp(quantity.valueScaled × unitPrice.amountMinor / 1000)
```

Quantities are integers in milli-units (1.5 kg → `1500`), prices are integers in
đồng. The division by 1000 is the only place a fraction can appear, and it is
resolved by half-up rounding — the convention a Vietnamese market trader uses by
hand.

Worked example: 1.5 kg at 12.345 ₫/kg → `1500 × 12345 / 1000 = 18517.5` → **18.518 ₫**.

This rule is P0 because it is the single arithmetic step between a worker's input
and a customer's debt. It is tested with exact expected integers, including
half-way values, never with floating-point tolerance.

---

### BR-ORDER-005 — A confirmed order cannot be confirmed again

**Risk:** P1 · **Code:** `ORDER_ALREADY_CONFIRMED` · **Tests:** TC-ORDER-008 · **Cases:** CASE-ORDER-003

A _replay of the same command_ is not a second confirmation; it is intercepted by
the idempotency layer before the domain runs (BR-COMMAND-001). This rule catches
the other case: a person genuinely pressing confirm on an already-confirmed order.

---

### BR-ORDER-006 — Confirming with a stale version is refused

**Risk:** P0 · **Code:** `ORDER_VERSION_CONFLICT` · **Tests:** TC-ORDER-005 · **Cases:** CASE-ORDER-004

If `command.expectedVersion ≠ order.version`, the command is refused with both
values in `details`. Two workers editing the same order on two phones must not
have one silently overwrite the other's lines and confirm a total that neither
intended.

---

### BR-ORDER-007 — Confirmation produces exactly one debt ledger entry

**Risk:** P0 · **Code:** — · **Tests:** TC-ORDER-003 · **Cases:** CASE-DEBT-001

One entry, `amount = +order.totalAmount`, `sourceType = order_confirmation`,
`sourceId = orderId`, `transactionTime = command.occurredAt`.

Not zero (the debt would be lost), not two (the customer would owe double). This
is the rule that the "confirm twice over a flaky connection" scenario is really
about.

---

### BR-ORDER-008 — A confirmed order is never deleted

**Risk:** P0 · **Code:** — · **Tests:** TC-ORDER-009 · **Cases:** CASE-ORDER-007

No delete path exists in the repository, and a Postgres trigger raises on `DELETE`
against `orders`. Correcting a confirmed order in this phase means
`AdjustCustomerDebt` with a stated reason.

---

### BR-ORDER-009 — All line currencies must match the order currency

**Risk:** P1 · **Code:** `ORDER_CURRENCY_MISMATCH` · **Tests:** TC-ORDER-010

Only VND exists today, so this rule is unreachable in practice. It is implemented
anyway because the moment a second currency is added, silently summing mixed
currencies into one total is a P0 money bug, and the guard is three lines.

---

## Deprecated rules

None yet.

## Related

- [../02-use-cases/UC-ORDER-001-create-and-confirm-order.md](../02-use-cases/UC-ORDER-001-create-and-confirm-order.md)
- [../03-state-machines/order-state-machine.md](../03-state-machines/order-state-machine.md)
- [../05-casebook/order-cases.md](../05-casebook/order-cases.md)
- [error-code-catalog.md](error-code-catalog.md)
