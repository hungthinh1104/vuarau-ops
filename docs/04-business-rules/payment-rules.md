# Payment business rules

---

### BR-PAYMENT-001 — Payment amount must be greater than zero

**Risk:** P0 · **Code:** `PAYMENT_AMOUNT_INVALID` · **Tests:** TC-PAYMENT-003

Applies to both recording and reversing. A zero payment is meaningless; a negative
one is a debt increase wearing a disguise, and debt increases go through
`AdjustCustomerDebt` where a reason is mandatory.

---

### BR-PAYMENT-002 — Recording a payment produces exactly one ledger entry of −amount

**Risk:** P0 · **Code:** `PAYMENT_ALREADY_EXISTS` · **Tests:** TC-PAYMENT-001, TC-PAYMENT-012 · **Cases:** CASE-PAYMENT-001, CASE-PAYMENT-002, CASE-ACCOUNT-002

`sourceType = payment`, `sourceId = paymentId`,
`transactionTime = command.occurredAt`. The customer's balance drops by exactly the
amount received — once.

The payment identity is single-use. A different command with an already recorded
`paymentId` is refused as `PAYMENT_ALREADY_EXISTS`; only a retry of the original
idempotency key replays the stored result.

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

### BR-PAYMENT-009 — Unallocated customer payment remains an explicit exception

**Risk:** P1 · **Tests:** TC-OPS-024

For a customer, the unresolved payment amount is the exact sum of each active
Payment's remaining amount after effective allocations and allocation reversals:

```
unallocated = max(payment − reversed − effective allocations, 0)
```

The amount remains a canonical payment fact; it is not silently treated as
`awaiting_payment`, a Sale payment, or a new credit adjustment. The Operations
Board exposes the exception and amount separately, with allocation or intentional
customer-credit preservation as the operator decision. Preservation is the
`customer_credit_preserved` debt-observation fact: it must name the exact Payment,
customer and amount still unallocated. It changes no account ledger entry and
cannot be combined with a later allocation or reversal that would exceed the
remaining payment. The exception resolves only when the canonical payment is
allocated/reversed or the exact remaining amount is covered by that fact.

---

## Explicitly permitted, not an error

| Situation                            | Rule                                                                          | Reference                                 |
| ------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------- |
| Payment larger than current debt     | Allowed; balance goes negative                                                | ASM-001, TC-PAYMENT-011, CASE-PAYMENT-003 |
| Payment not tied to any sale         | Allowed; it remains unallocated unless a policy-backed allocation is recorded | ASM-004, CASE-PAYMENT-005                 |
| Someone other than the customer pays | Allowed; `payerName` records it                                               | CASE-PAYMENT-004                          |
| Payment back-dated to yesterday      | Allowed; `transactionTime` is authoritative                                   | BR-COMMAND-003, CASE-PAYMENT-008          |

## Deprecated rules

None yet.

## Related

- [../02-use-cases/UC-PAYMENT-001-record-customer-payment.md](../02-use-cases/UC-PAYMENT-001-record-customer-payment.md)
- [../02-use-cases/UC-PAYMENT-002-reverse-customer-payment.md](../02-use-cases/UC-PAYMENT-002-reverse-customer-payment.md)
- [../05-casebook/payment-cases.md](../05-casebook/payment-cases.md)
