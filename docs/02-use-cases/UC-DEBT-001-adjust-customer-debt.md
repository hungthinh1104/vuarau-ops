# UC-DEBT-001 — Adjust customer debt manually

**Risk:** P0 · **Status:** implemented · **Command:** `AdjustCustomerDebt`

## Intent

Two situations that no order and no payment can express:

1. **Opening balance.** A customer already owed 5.000.000 ₫ before the depot
   started using this system.
2. **Correction or write-off.** A confirmed order was wrong, or the owner forgives
   part of a balance.

This is the only command that moves money without an underlying business document,
which is exactly why the reason is mandatory and the audit trail is not optional.

## Actor

Any authenticated member of the workspace. **This is knowingly too permissive** —
manual debt adjustment is the most abusable command in the system. Restricting it
to an owner role is ASM-007 and is the highest-priority follow-up.

## Preconditions

- Customer exists in the workspace.
- Client has generated `adjustmentId`.

## Main flow

1. Client sends `AdjustCustomerDebt`: `adjustmentId`, `customerId`, `direction`
   (`increase` | `decrease`), positive `amount`, `reasonCode`, free-text `reason`.
2. Backend validates the schema; a blank reason is refused (BR-DEBT-003).
3. Backend confirms the customer exists in the workspace.
4. Domain emits **exactly one** ledger effect:
   `+amount` for `increase`, `−amount` for `decrease`,
   `sourceType = manual_adjustment`, `sourceId = adjustmentId`,
   carrying both `reasonCode` and `reason` onto the ledger row itself.
5. Backend commits the entry, the summary update, the audit record, and the command
   receipt in one transaction.
6. Backend returns the updated `CustomerDebtSummaryDto`.

The reason travels **on the ledger entry**, not only in the audit log. Someone
reading the debt book six months later must see why the number moved without
joining another table.

## Alternate flows

| Situation                                | Outcome                                              |
| ---------------------------------------- | ---------------------------------------------------- |
| Blank or whitespace reason               | `DEBT_ADJUSTMENT_REASON_REQUIRED` (BR-DEBT-003)      |
| Zero or negative amount                  | `DEBT_ADJUSTMENT_AMOUNT_INVALID` (BR-DEBT-008)       |
| Customer not found in this workspace     | `CUSTOMER_NOT_FOUND`                                 |
| Adjustment pushes the balance below zero | **Accepted** (ASM-001)                               |
| Same command replayed                    | Original summary; exactly one entry (BR-COMMAND-001) |

## Postconditions

- Exactly one ledger entry carrying `reasonCode` and `reason`.
- Debt summary moved by exactly that signed amount.
- One audit record `debt.adjusted` including the reason.
- No existing row modified.

## Business rules

BR-DEBT-001, BR-DEBT-002, BR-DEBT-003, BR-DEBT-004, BR-DEBT-005, BR-DEBT-008,
BR-COMMAND-001, BR-COMMAND-005

## Cases

CASE-DEBT-004, CASE-DEBT-005, CASE-DEBT-006

## Tests

TC-DEBT-003, TC-DEBT-004, TC-DEBT-006

## Implementation

- `packages/domain-kernel/src/debt/adjust-debt.ts`
- `apps/api/src/modules/debt/adjust-debt.handler.ts`

## Open questions

- Permission model (ASM-007) — currently any workspace member may do this.
- Should large adjustments require a second approver? Not decided; see
  [decision backlog](../09-decisions/decision-backlog.md).
