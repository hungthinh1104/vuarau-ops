# ADR-0019 — Keep supplier money and physical quantity explicit

## Status

Accepted for M16–M18.

## Context

Customer receivable, Supplier payable and physical quantity share mechanics but
not vocabulary, permissions, sources or correction policy. A generic ledger
would make invalid cross-domain operations easy to express.

## Decision

Supplier payable uses its own append-only ledger rather than generalizing the
customer account ledger. Physical quantity uses a separate append-only inventory
movement ledger keyed by Product and unit. Neither ledger is a general accounting
engine.

## Consequences

Shared pure money/ordering helpers remain reusable, but source types, tables,
permissions and reconciliation stay explicit. Inventory is not valued, units are
not converted, negative quantity remains visible, and M18 does not infer outbound
movement from financial Sale events.

## Alternatives considered

- One generic counterparty ledger: rejected because it erases which side owes
  whom and permits sources that do not belong to that account.
- One valued inventory/accounting ledger: rejected because M18 has no valuation,
  COGS or unit-conversion policy.

## Revisit when

Only after at least two implemented operations require the same additional
boundary and tests can preserve the distinct business semantics.
