# Transition catalog

Every state change in the system, in one table. A command that is not listed here
cannot change a lifecycle value.

| ID          | Aggregate | From → To                                       | Command                  | Guard summary                                                    | Ledger effect             | Event              | Rejection codes                                                                                             | Implemented |
| ----------- | --------- | ----------------------------------------------- | ------------------------ | ---------------------------------------------------------------- | ------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- | ----------- |
| T-ORDER-001 | Order     | ∅ → `draft`                                     | `CreateOrder`            | Customer exists; lines valid; currencies consistent              | none                      | `order.created`    | `CUSTOMER_NOT_FOUND`, `ORDER_LINE_INVALID`, `ORDER_CURRENCY_MISMATCH`                                       | ✅          |
| T-ORDER-002 | Order     | `draft` → `confirmed`                           | `ConfirmOrder`           | Version matches; ≥ 1 line; lines valid                           | **+total**, one entry     | `order.confirmed`  | `ORDER_EMPTY`, `ORDER_LINE_INVALID`, `ORDER_VERSION_CONFLICT`, `ORDER_ALREADY_CONFIRMED`, `ORDER_CANCELLED` | ✅          |
| T-ORDER-003 | Order     | `draft` → `cancelled`                           | `CancelOrder`            | Version matches                                                  | none                      | `order.cancelled`  | —                                                                                                           | ❌ ASM-005  |
| T-ORDER-004 | Order     | `confirmed` → `cancelled`                       | `CancelOrder`            | Version matches; policy on existing payments undecided (ASM-005) | **−total**, compensating  | `order.cancelled`  | —                                                                                                           | ❌ ASM-005  |
| T-PAY-001   | Payment   | ∅ → `recorded`                                  | `RecordCustomerPayment`  | Amount > 0; customer exists; currency matches                    | **−amount**, one entry    | `payment.recorded` | `PAYMENT_AMOUNT_INVALID`, `CUSTOMER_NOT_FOUND`, `PAYMENT_CURRENCY_MISMATCH`                                 | ✅          |
| T-PAY-002   | Payment   | `recorded` → `partially_reversed`               | `ReverseCustomerPayment` | Version matches; `0 < amount < remaining`; reason given          | **+amount**, compensating | `payment.reversed` | `PAYMENT_VERSION_CONFLICT`, `PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT`, `PAYMENT_REVERSAL_REASON_REQUIRED` | ✅          |
| T-PAY-003   | Payment   | `partially_reversed` → `partially_reversed`     | `ReverseCustomerPayment` | Same, against the new remaining                                  | **+amount**, compensating | `payment.reversed` | Same as T-PAY-002                                                                                           | ✅          |
| T-PAY-004   | Payment   | `recorded` \| `partially_reversed` → `reversed` | `ReverseCustomerPayment` | `amount = remaining`                                             | **+amount**, compensating | `payment.reversed` | Same as T-PAY-002                                                                                           | ✅          |
| T-PAY-005   | Payment   | `reversed` → ✗                                  | `ReverseCustomerPayment` | Always refused                                                   | none                      | none               | `PAYMENT_ALREADY_REVERSED`                                                                                  | ✅          |
| T-CUST-001  | Customer  | ∅ → active                                      | `CreateCustomer`         | Name non-blank                                                   | none                      | `customer.created` | `CUSTOMER_NAME_REQUIRED`                                                                                    | ✅          |

## Ledger-only commands

`AdjustCustomerDebt` changes **no** lifecycle value. It appends one ledger entry
(`±amount`, `sourceType = manual_adjustment`) and updates the debt summary. It is
listed here so its absence from the table above is understood as deliberate rather
than missing.

## Invariants across all transitions

1. Exactly one database transaction per command (BR-COMMAND-005). A transition and
   its ledger effect either both commit or neither does.
2. Every transition increments the aggregate version by exactly one.
3. Every transition writes one audit record naming the actor and the command.
4. No transition updates or deletes an existing ledger entry (BR-DEBT-005).
5. A replayed command produces the original result and **no** second transition
   (BR-COMMAND-001).

## Related

- [state-catalog.md](state-catalog.md)
- [../04-business-rules/order-rules.md](../04-business-rules/order-rules.md)
- [../04-business-rules/payment-rules.md](../04-business-rules/payment-rules.md)
