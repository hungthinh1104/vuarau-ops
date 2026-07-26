# Payment state machine

**Aggregate:** `Payment` · **Dimension:** reversal lifecycle only

```
     RecordCustomerPayment
 ( ∅ ) ──────────────────▶ [ recorded ]
                                │
                                │ ReverseCustomerPayment (amount < remaining)
                                ▼
                    ┌──▶ [ partially_reversed ]
                    │           │
     (again, still  └───────────┤ ReverseCustomerPayment (amount = remaining)
      < remaining)              ▼
                          [ reversed ]  ← ReverseCustomerPayment (full amount)
                            terminal        directly from `recorded`
```

## The status is derived, never set

`status` is a stored **consequence** of `reversedAmount`, computed by one function
(BR-PAYMENT-008):

```
reversedAmount = 0        → recorded
0 < reversedAmount < amount → partially_reversed
reversedAmount = amount   → reversed
```

There is no `setPaymentStatus` command and no code path that writes `status`
independently of `reversedAmount`. Persisting it is a query convenience; the
derivation is the truth. A derived condition becoming an independently settable
column is how these two fields drift apart in production.

## Transitions

| #         | From                               | To                   | Command                  | Guards                                                                                                                   | Effects                                                                                                                                                              | Events             | Rejection codes                                                                                                                       | Terminal |
| --------- | ---------------------------------- | -------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| T-PAY-001 | ∅                                  | `recorded`           | `RecordCustomerPayment`  | Amount > 0 (BR-PAYMENT-001); customer exists; currency matches                                                           | Payment at `version = 1`, `reversedAmount = 0`; **one** ledger entry `−amount` (BR-PAYMENT-002); summary updated; audit                                              | `payment.recorded` | `PAYMENT_AMOUNT_INVALID`, `CUSTOMER_NOT_FOUND`, `PAYMENT_CURRENCY_MISMATCH`                                                           | no       |
| T-PAY-002 | `recorded`                         | `partially_reversed` | `ReverseCustomerPayment` | `expectedVersion` matches (BR-PAYMENT-007); `0 < amount < remaining` (BR-PAYMENT-003); reason non-blank (BR-PAYMENT-004) | Reversal row; `reversedAmount += amount`; `version + 1`; **one** compensating ledger entry `+amount` linked via `reversalOfEntryId` (BR-PAYMENT-005); summary; audit | `payment.reversed` | `PAYMENT_VERSION_CONFLICT`, `PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT`, `PAYMENT_REVERSAL_REASON_REQUIRED`, `PAYMENT_AMOUNT_INVALID` | no       |
| T-PAY-003 | `partially_reversed`               | `partially_reversed` | `ReverseCustomerPayment` | Same, with `remaining = amount − reversedAmount`                                                                         | Same                                                                                                                                                                 | `payment.reversed` | Same                                                                                                                                  | no       |
| T-PAY-004 | `recorded` \| `partially_reversed` | `reversed`           | `ReverseCustomerPayment` | `amount = remaining`                                                                                                     | Same                                                                                                                                                                 | `payment.reversed` | Same                                                                                                                                  | **yes**  |
| T-PAY-005 | `reversed`                         | —                    | `ReverseCustomerPayment` | Refused                                                                                                                  | none                                                                                                                                                                 | none               | `PAYMENT_ALREADY_REVERSED` (BR-PAYMENT-006)                                                                                           | —        |

## Reversal is not a negative payment

A reversal produces a `payment_reversals` row plus a compensating ledger entry. It
never produces a second `payments` row (BR-PAYMENT-005). If it did, "how much has
this customer actually paid us" would need to know which payments are real, and
every report downstream would have to know it too.

## Compensation, not deletion

The original payment row and its original ledger entry are never updated or
deleted. `reversedAmount` and `status` on the payment are the only mutable fields,
and they only ever move in one direction. Database triggers block `DELETE` on
`payments`, `payment_reversals`, and `debt_ledger_entries` outright.

## Related

- [state-catalog.md](state-catalog.md), [transition-catalog.md](transition-catalog.md)
- [../04-business-rules/payment-rules.md](../04-business-rules/payment-rules.md)
- [../02-use-cases/UC-PAYMENT-002-reverse-customer-payment.md](../02-use-cases/UC-PAYMENT-002-reverse-customer-payment.md)
