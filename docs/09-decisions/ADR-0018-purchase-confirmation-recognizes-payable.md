# ADR-0018 — Purchase confirmation recognizes supplier payable

## Status

Accepted for M17.

## Context

Purchase confirmation and physical Receiving happen at different times. Without
one named recognition point, both handlers could create supplier payable or
neither could.

## Decision

Supplier payable arises when a Purchase is confirmed. `ConfirmPurchase` writes
the frozen Purchase, one positive supplier-account entry, projection and audit
atomically. Receiving does not move supplier money.

## Consequences

A confirmed but not yet received Purchase is still payable. A Receipt affects
physical quantity only. A wrong Purchase must be voided (after reversing active
Receipts), producing the exact payable compensation. This avoids recognizing the
same liability at both confirmation and receiving.

## Alternatives considered

- Recognize at Receipt: rejected because partial Receipts would split a
  commercial liability and move it again as later Receipts arrive.
- Allocate payments to Purchases: rejected because cash-out is independent and
  no allocation workflow has been proven.

## Revisit when

Only if real depot policy proves liability is accepted at another explicit
business event and migration/correction semantics are designed first.
