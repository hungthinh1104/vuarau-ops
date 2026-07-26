# Payment business rules

---

### BR-PAYMENT-001 — Payment amount must be greater than zero

**Risk:** P0 · **Code:** `PAYMENT_AMOUNT_INVALID` · **Tests:** TC-PAYMENT-003

Applies to both recording and reversing. A zero payment is meaningless; a negative
one is a debt increase wearing a disguise, and debt increases go through
`AdjustCustomerDebt` where a reason is mandatory.

---

### BR-PAYMENT-002 — Recording a payment produces exactly one ledger entry of −amount

**Risk:** P0 · **Code:** — · **Tests:** TC-PAYMENT-001 · **Cases:** CASE-PAYMENT-001, CASE-PAYMENT-002, CASE-DEBT-002

`sourceType = payment`, `sourceId = paymentId`,
`transactionTime = command.occurredAt`. The customer's balance drops by exactly the
amount received — once.

---

### BR-PAYMENT-003 — A reversal cannot exceed the remaining reversible amount

**Risk:** P0 · **Code:** `PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT` · **Tests:** TC-PAYMENT-007

```
remaining = payment.amount − payment.reversedAmount
0 < requested ≤ remaining
```

`details` carries `remaining` and `requested`. Without this rule, repeated partial
reversals would manufacture debt out of a payment that no longer has any value
left to undo.

---

### BR-PAYMENT-004 — A reversal requires a reason

**Risk:** P1 · **Code:** `PAYMENT_REVERSAL_REASON_REQUIRED` · **Tests:** TC-PAYMENT-009

Non-blank after trimming. Reversing money is a contested action; six months later
"why did this payment disappear" must be answerable from the record itself.

---

### BR-PAYMENT-005 — A reversal creates a compensating entry, never a second payment

**Risk:** P0 · **Code:** — · **Tests:** TC-PAYMENT-004, TC-PAYMENT-005 · **Cases:** CASE-PAYMENT-009, CASE-PAYMENT-010, CASE-PAYMENT-011

A successful reversal produces:

- one `payment_reversals` row;
- one ledger entry of `+amount`, `sourceType = payment_reversal`,
  `sourceId = reversalId`, `reversalOfEntryId` = the original payment's entry;
- an updated `reversedAmount` and derived status on the original payment.

It produces **no** new `payments` row. "How much has this customer paid us" must
remain a sum over `payments`, not a sum over payments-that-are-not-secretly-reversals.

---

### BR-PAYMENT-006 — A fully reversed payment cannot be reversed again

**Risk:** P1 · **Code:** `PAYMENT_ALREADY_REVERSED` · **Tests:** TC-PAYMENT-008

`reversed` is terminal. A replay of the same reversal command is handled earlier by
idempotency (BR-COMMAND-001) and does not reach this rule.

---

### BR-PAYMENT-007 — Reversing with a stale version is refused

**Risk:** P0 · **Code:** `PAYMENT_VERSION_CONFLICT` · **Tests:** TC-PAYMENT-006

Two people reversing the same payment from two phones must not both succeed and
double the compensating debt. The loser is told, and re-reads.

---

### BR-PAYMENT-008 — Payment status is derived from reversedAmount

**Risk:** P1 · **Code:** — · **Tests:** TC-PAYMENT-010

```
reversedAmount = 0          → recorded
0 < reversedAmount < amount → partially_reversed
reversedAmount = amount     → reversed
```

Computed by exactly one function. No command sets `status` directly. See
[../03-state-machines/payment-state-machine.md](../03-state-machines/payment-state-machine.md).

---

## Explicitly permitted, not an error

| Situation                            | Rule                                        | Reference                                 |
| ------------------------------------ | ------------------------------------------- | ----------------------------------------- |
| Payment larger than current debt     | Allowed; balance goes negative              | ASM-001, TC-PAYMENT-011, CASE-PAYMENT-003 |
| Payment not tied to any order        | Allowed; allocation is not modelled         | ASM-004, CASE-PAYMENT-005                 |
| Someone other than the customer pays | Allowed; `payerName` records it             | CASE-PAYMENT-004                          |
| Payment back-dated to yesterday      | Allowed; `transactionTime` is authoritative | BR-COMMAND-003, CASE-PAYMENT-008          |

## Deprecated rules

None yet.

## Related

- [../02-use-cases/UC-PAYMENT-001-record-customer-payment.md](../02-use-cases/UC-PAYMENT-001-record-customer-payment.md)
- [../02-use-cases/UC-PAYMENT-002-reverse-customer-payment.md](../02-use-cases/UC-PAYMENT-002-reverse-customer-payment.md)
- [../05-casebook/payment-cases.md](../05-casebook/payment-cases.md)
