# Transition catalog

Every state change in the system, in one table. A command that is not listed here
cannot change a lifecycle value.

| ID           | Aggregate  | From → To                                       | Command                     | Guard summary                                        | Account effect             | Event                  | Rejection codes                                                                                             | Implemented |
| ------------ | ---------- | ----------------------------------------------- | --------------------------- | ---------------------------------------------------- | -------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------- | ----------- |
| T-SALE-001   | Sale       | ∅ → `draft`                                     | `CreateSaleDraft`           | Customer exists; lines valid; currencies consistent  | **none** (BR-SALE-010)     | `sale.draft_created`   | `CUSTOMER_NOT_FOUND`, `SALE_LINE_INVALID`, `SALE_CURRENCY_MISMATCH`, `SALE_NOT_FOUND` (replaced sale)       | ✅          |
| T-SALE-002   | Sale       | `draft` → `posted`                              | `PostSale`                  | Version matches; ≥ 1 line; lines valid               | **+total**, one entry      | `sale.posted`          | `SALE_EMPTY`, `SALE_LINE_INVALID`, `SALE_VERSION_CONFLICT`, `SALE_ALREADY_POSTED`                           | ✅          |
| T-SALE-003   | Sale       | `draft` → `draft` (new lines)                   | `UpdateSaleDraft`           | Version matches; status is `draft`                   | **none** (BR-SALE-010)     | `sale.draft_edited`    | `SALE_ALREADY_POSTED`, `SALE_ALREADY_DISCARDED`, `SALE_VERSION_CONFLICT`, `SALE_LINE_INVALID`               | ✅          |
| T-SALE-004   | Sale       | `draft` → `discarded`                           | `DiscardSaleDraft`          | Version matches; status is `draft`                   | **none** (BR-SALE-010)     | `sale.discarded`       | `SALE_ALREADY_POSTED`, `SALE_ALREADY_DISCARDED`, `SALE_VERSION_CONFLICT`                                    | ✅          |
| T-VOID-001   | SaleVoid   | ∅ → void record exists (sale becomes `voided`)  | `VoidSale`                  | Sale is `posted`; not already voided; reason present | **−total**, compensating   | `sale.voided`          | `SALE_NOT_FOUND`, `SALE_NOT_POSTED`, `SALE_ALREADY_VOIDED`, `SALE_VOID_REASON_REQUIRED`                     | ✅          |
| T-PAY-001    | Payment    | ∅ → `recorded`                                  | `RecordCustomerPayment`     | Amount > 0; customer exists; currency matches        | **−amount**, one entry     | `payment.recorded`     | `PAYMENT_AMOUNT_INVALID`, `CUSTOMER_NOT_FOUND`, `PAYMENT_CURRENCY_MISMATCH`                                 | ✅          |
| T-PAY-002    | Payment    | `recorded` → `partially_reversed`               | `ReverseCustomerPayment`    | Version matches; `0 < amount < remaining`; reason    | **+amount**, compensating  | `payment.reversed`     | `PAYMENT_VERSION_CONFLICT`, `PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT`, `PAYMENT_REVERSAL_REASON_REQUIRED` | ✅          |
| T-PAY-003    | Payment    | `partially_reversed` → `partially_reversed`     | `ReverseCustomerPayment`    | Same, against the new remaining                      | **+amount**, compensating  | `payment.reversed`     | Same as T-PAY-002                                                                                           | ✅          |
| T-PAY-004    | Payment    | `recorded` \| `partially_reversed` → `reversed` | `ReverseCustomerPayment`    | `amount = remaining`                                 | **+amount**, compensating  | `payment.reversed`     | Same as T-PAY-002                                                                                           | ✅          |
| T-PAY-005    | Payment    | `reversed` → ✗                                  | `ReverseCustomerPayment`    | Always refused                                       | none                       | none                   | `PAYMENT_ALREADY_REVERSED`                                                                                  | ✅          |
| T-CUST-001   | Customer   | ∅ → active                                      | `CreateCustomer`            | Name non-blank                                       | none                       | `customer.created`     | `CUSTOMER_NAME_REQUIRED`                                                                                    | ✅          |
| T-CUST-002   | Customer   | active → active (new details)                   | `UpdateCustomer`            | Version matches; name non-blank                      | none                       | `customer.updated`     | `CUSTOMER_NOT_FOUND`, `CUSTOMER_NAME_REQUIRED`, `CUSTOMER_VERSION_CONFLICT`                                 | ✅          |
| T-CUST-003   | Customer   | active → inactive                               | `DeactivateCustomer`        | Version matches; still active                        | **none** (BR-CUSTOMER-003) | `customer.deactivated` | `CUSTOMER_NOT_FOUND`, `CUSTOMER_ALREADY_INACTIVE`, `CUSTOMER_VERSION_CONFLICT`                              | ✅          |
| T-MEMBER-001 | Membership | active → inactive                               | `RevokeWorkspaceMembership` | Caller holds `workspace.manage`; not the last owner  | none                       | `membership.revoked`   | `WORKSPACE_ACCESS_DENIED`, `PERMISSION_DENIED`, `WORKSPACE_MEMBERSHIP_INACTIVE`, `WORKSPACE_LAST_OWNER`     | ✅          |

## Ledger-only commands

`AdjustCustomerDebt` changes **no** lifecycle value. It appends one account entry
(`±amount`, `sourceType = manual_adjustment`) and updates the balance. It is listed
here so its absence from the table above is understood as deliberate rather than
missing. Its legitimate uses, and the fact that correcting a sale is not one of
them, are BR-ACCOUNT-010.

## Transitions that were removed

| Retired     | Was                         | Replaced by                                                     |
| ----------- | --------------------------- | --------------------------------------------------------------- |
| T-ORDER-001 | ∅ → `draft` (`CreateOrder`) | T-SALE-001, renamed                                             |
| T-ORDER-002 | `draft` → `confirmed`       | T-SALE-002, renamed                                             |
| T-ORDER-003 | `draft` → `cancelled`       | T-SALE-004 — a draft is _discarded_, which is not a money event |
| T-ORDER-004 | `confirmed` → `cancelled`   | T-VOID-001 — a posted sale is _voided_, which is                |

`cancelled` was one word doing two jobs. Discarding a draft touches no money;
voiding a posted sale moves the full amount back. Collapsing them meant the
ledger effect of a "cancel" depended on the state it started from — precisely the
kind of implicitness that produces a wrong balance nobody can explain. ASM-005 is
closed by splitting them.

## Invariants across all transitions

1. Exactly one database transaction per command (BR-COMMAND-005). A transition and
   its account effect either both commit or neither does.
2. Every transition on a mutable aggregate increments its version by exactly one.
   `posted` sales have no further transitions, so their version stops moving.
3. Every transition writes one audit record naming the actor and the command.
4. No transition updates or deletes an existing account entry (BR-ACCOUNT-005),
   or a posted sale (BR-SALE-008).
5. A replayed command produces the original result and **no** second transition
   (BR-COMMAND-001).
6. A refused command produces no transition, no receipt, and no consumed
   idempotency key (BR-COMMAND-006).

## Related

- [state-catalog.md](state-catalog.md), [sale-state-machine.md](sale-state-machine.md)
- [../04-business-rules/sale-rules.md](../04-business-rules/sale-rules.md)
- [../04-business-rules/payment-rules.md](../04-business-rules/payment-rules.md)
