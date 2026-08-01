# Cashbook rules

- **BR-CASH-001** — CashAccount is workspace-scoped, versioned and deactivated
  rather than deleted. `employee_holding` requires one custodian; every other kind
  forbids a custodian.
- **BR-CASH-002** — CashMovement is the append-only canonical money-location
  ledger. Positive means money entered the account; negative means it left.
- **BR-CASH-003** — A cashbook-enabled customer Payment appends one positive cash
  movement in the same transaction as its negative customer-account entry.
- **BR-CASH-004** — A cashbook-enabled Supplier Payment appends one negative cash
  movement in the same transaction as its negative supplier-payable entry.
- **BR-CASH-005** — Payment reversal uses the original linked account and appends
  the exact opposite cash effect for the reversed amount. Legacy unlinked payments
  require an explicit account when cashbook is enabled.
- **BR-CASH-006** — Expense is a positive source document and creates one negative
  movement; reversal is append-only and creates one positive inverse movement.
- **BR-CASH-007** — CashTransfer creates one equal negative/positive movement pair
  between different active same-currency accounts. Reversal creates the exact
  inverse pair. Total cash is conserved.
- **BR-CASH-008** — CashAdjustment requires direction, positive amount, reason code
  and nonblank explanation; it is not a shortcut for Payment, SupplierPayment,
  Expense or Transfer.
- **BR-CASH-009** — CashBalance is disposable. Reconciliation compares it with the
  canonical sum and validates every supported source. Rebuild refuses source
  corruption.
- **BR-CASH-010** — Operational cash and expense reports are source-backed, use
  `transactionTime` plus the workspace business-day boundary and never become a
  second ledger.
- **BR-CASH-011** — Backup V7 includes CashAccount and all canonical cash sources/
  movements. Restore rebuilds projections and must reconcile before commit success.
