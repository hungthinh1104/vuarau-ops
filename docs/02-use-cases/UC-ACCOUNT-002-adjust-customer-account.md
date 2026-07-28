# UC-ACCOUNT-002 — Adjust customer debt manually

**Risk:** P0 · **Status:** implemented · **Command:** `AdjustCustomerDebt`

## Intent

Two situations that no sale and no payment can express:

1. **Opening balance.** A customer already owed 5.000.000 ₫ before the depot
   started using this system.
2. **Settlement or write-off.** The owner forgives or settles part of a balance
   without changing an underlying Sale or Payment.

This is the only command that moves money without an underlying business document,
which is exactly why the reason is mandatory and the audit trail is not optional.

## Actor

Owner or accountant with `debt.adjust`. A sales worker is refused. This command
never corrects a posted Sale, which must use void plus replacement instead.

## Preconditions

- Customer exists in the workspace.
- Client has generated `adjustmentId`.

## Main flow

1. Client sends `AdjustCustomerDebt`: `adjustmentId`, `customerId`, `direction`
   (`increase` | `decrease`), positive `amount`, `reasonCode`, free-text `reason`.
2. Backend validates the schema; a blank reason is refused (BR-ACCOUNT-003).
3. Backend confirms the customer exists in the workspace.
4. Domain emits **exactly one** ledger effect:
   `+amount` for `increase`, `−amount` for `decrease`,
   `sourceType = manual_adjustment`, `sourceId = adjustmentId`,
   carrying both `reasonCode` and `reason` onto the ledger row itself.
5. Backend commits the entry, the summary update, the audit record, and the command
   receipt in one transaction.
6. Backend returns the updated `CustomerAccountBalanceDto`.

The reason travels **on the ledger entry**, not only in the audit log. Someone
reading the debt book six months later must see why the number moved without
joining another table.

That `manual_adjustment` ledger entry is the canonical adjustment record. Detail
screens project it with customer, workspace and actor; audit remains an audit trail.

## Alternate flows

| Situation                                | Outcome                                              |
| ---------------------------------------- | ---------------------------------------------------- |
| Blank or whitespace reason               | `DEBT_ADJUSTMENT_REASON_REQUIRED` (BR-ACCOUNT-003)   |
| Zero or negative amount                  | `DEBT_ADJUSTMENT_AMOUNT_INVALID` (BR-ACCOUNT-008)    |
| Customer not found in this workspace     | `CUSTOMER_NOT_FOUND`                                 |
| Adjustment pushes the balance below zero | **Accepted** (ASM-001)                               |
| Same command replayed                    | Original summary; exactly one entry (BR-COMMAND-001) |

## Postconditions

- Exactly one ledger entry carrying `reasonCode` and `reason`.
- Debt summary moved by exactly that signed amount.
- One audit record `debt.adjusted` including the reason.
- No existing row modified.

## Business rules

BR-ACCOUNT-001, BR-ACCOUNT-002, BR-ACCOUNT-003, BR-ACCOUNT-004, BR-ACCOUNT-005, BR-ACCOUNT-008,
BR-COMMAND-001, BR-COMMAND-005

## Cases

CASE-ACCOUNT-004, CASE-ACCOUNT-005, CASE-ACCOUNT-006

## Tests

TC-ACCOUNT-003, TC-ACCOUNT-004, TC-ACCOUNT-006

## Implementation

- `packages/domain-kernel/src/account/adjust-debt.ts`
- `apps/api/src/modules/account/adjust-debt.handler.ts`

## Open questions

- Should large adjustments require a second approver? Not decided; see
  [decision backlog](../09-decisions/decision-backlog.md).
