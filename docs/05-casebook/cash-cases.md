# Cashbook cases

## CASE-CASH-001 — Customer pays cash held in the depot drawer

A customer pays 500.000 ₫. The same command reduces customer debt by 500.000 ₫ and
increases the selected drawer by 500.000 ₫. A dropped response is retried with the
same identity and creates neither a second debt entry nor a second cash movement.
A partial reversal increases debt and decreases that same drawer by the reversed
amount.

## CASE-CASH-002 — Driver hands collected money to the owner

A customer Payment is recorded into the driver's `employee_holding` account. Later
the driver hands the money over; one CashTransfer decreases that account and
increases the drawer. Total money across both accounts does not change. Reversing a
mistaken transfer appends the exact inverse pair.

## CASE-CASH-003 — Fuel expense was recorded by mistake

A 150.000 ₫ fuel Expense decreases the selected account. The original source and
movement are immutable. An Expense reversal appends a separate source and positive
inverse movement; it never deletes or edits the original.
