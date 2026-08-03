# ADR-0025 — Cash location is a separate append-only ledger

**Status:** accepted and implemented · 2026-08-02

## Context

Customer and Supplier account ledgers answer who owes whom. They do not answer
where money physically or electronically sits. A customer Payment may reduce debt
while increasing a cash drawer, bank account or money held by a delivery worker.
A Supplier Payment decreases payable while decreasing one of those accounts.
Expenses, owner withdrawals and transfers have no customer debt effect at all.

Deriving cash from debt entries would lose payment method/account, expenses and
internal transfers. Storing only a mutable balance would make discrepancies
unexplainable.

## Decision

When `OperationalProfile.cashbookMode = accounts_ledger`, the workspace maintains:

- versioned `CashAccount` master data for drawer, bank, wallet, employee-held,
  owner funds or another named location;
- append-only source facts for Expense, Expense reversal, CashTransfer, Transfer
  reversal and explained CashAdjustment;
- one append-only `CashMovement` per source/account effect;
- one rebuildable `CashBalance` projection per account.

Customer and Supplier Payment commands remain the commercial money source. They
append their debt/payable entry and their cash movement in the same database
transaction. A retry cannot duplicate either effect.

## Signs and effects

```text
Customer payment                 + cash
Customer payment reversal        - cash
Supplier payment                 - cash
Supplier payment reversal        + cash
Expense                          - cash
Expense reversal                 + cash
Transfer source                  - cash
Transfer destination             + cash
Transfer reversal                exact inverse pair
Cash adjustment                  explicit signed amount
```

A transfer always conserves total cash across the two accounts. An Expense amount
is stored positive as the source document while its movement is negative.

## Invariants

- Every new Payment/SupplierPayment in a cashbook-enabled workspace names one
  active account with the same currency.
- The source fact and cash movement commit atomically.
- Cash account linkage on a recorded Payment is immutable.
- A linked reversal uses the original account. A legacy unlinked payment may name
  an account at reversal time without rewriting the original record.
- Employee-held accounts name exactly one custodian; shared accounts name none.
- Canonical cash source/movement rows are append-only.
- Projection rebuild is allowed only when source/movement integrity is healthy.
- Cashbook disablement blocks new cash commands but does not hide history.
- Backup V6 introduced and Backup V17 preserves source facts, pricing rules, operational evidence, workspace policy versions, commercial supply commitments, supplier observations, demand observations and movements, not `CashBalance`; restore rebuilds
  and reconciles every account before success.
- Date-filtered cash/expense reports use the workspace business-day boundary and
  `transactionTime`.

## Driver cash

Driver collection does not need a second money system. A depot that permits it can
assign an `employee_holding` account to the driver. Customer Payment increases that
account; handover is a CashTransfer to the drawer/bank. Role authority remains a
separate owner policy decision.

## Consequences

Cash location is explainable independently from customer debt and supplier payable. The cost is an additional canonical ledger whose source links, reversals, projections, backup and reconciliation must remain atomic with the commercial commands that move money.

## Deliberately separate

- Revenue and profit are not cash balance.
- Customer/Supplier debt allocation is not cash movement.
- Inventory valuation/COGS is not inferred from cash out.
- Bank-statement matching and physical cash-count sessions are separate
  policy-backed reconciliation workflows, not hidden fields on CashMovement. The
  current narrow adapters store exact source-linked match/close facts without
  changing CashMovement, debt or payable; broader settlement and variance semantics
  remain a field-policy decision.

## Alternatives considered

| Alternative                                | Why rejected                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| Derive cash from customer/supplier ledgers | Misses expenses, transfers and money location                          |
| Store one workspace cash number            | Cannot represent drawer/bank/employee custody or explain discrepancies |
| Put expense in debt adjustment             | Falsely changes what a customer or Supplier owes                       |
| Let reversal select any account            | Breaks source lineage and permits silent movement between accounts     |
| Update/delete a wrong movement             | Erases evidence; correction must be an inverse source fact             |

## Revisit when

Revisit when physical cash counting, bank-statement matching or settlement allocation requires a new canonical session model. Do not revisit merely to derive cash from debt or to replace movements with mutable balances.

## Related

- [ADR-0004](ADR-0004-append-only-debt-ledger.md)
- [ADR-0019](ADR-0019-separate-supplier-and-inventory-ledgers.md)
- [ADR-0024](ADR-0024-workspace-operational-profile.md)
- [data model](../07-data/data-model.md)
