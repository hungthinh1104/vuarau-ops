# Pricing rules

Pricing is an explicit catalogue of commercial facts, not a mutable field on a
Product and not an automatic rewrite of a posted Sale. This slice is technically
implemented and repository-verified; the precedence and adjustment choices still
need field validation before they are treated as depot policy.

### BR-PRICING-001 — A price rule is an append-only exact-money fact

Each rule is scoped to one workspace, Product, optional QualityGrade, optional
Customer and exact Unit. Prices and per-unit adjustments are non-negative integer
minor units in one currency. The kernel computes and stores the final unit price;
an override requires an actor-provided reason. A duplicate rule identity is
refused, and there is no update or delete repository operation.

The rule records `actorId`, `commandId`, `effectiveFrom`, `effectiveTo` and
`recordedAt`. The command pipeline supplies authorization, idempotency and the
transaction boundary. This does not decide when a depot considers a commercial
price authoritative; that remains an external policy gate.

### BR-PRICING-002 — Resolution is deterministic or explicitly ambiguous

Resolution matches Product, QualityGrade, Unit, effective time and quantity
threshold. Customer-specific rules are candidates only for that Customer; a
general rule is a candidate when a Customer is supplied, but specificity does not
silently outrank an explicit priority. The ranking is:

```text
priority → minimum quantity → effective-from time → stable rule id
```

If two candidates have the same first three values, the result is `ambiguous` and
no price is selected. Quantity units are never converted. A `Sale` still snapshots
the final agreed price on its posted line, so later rule history cannot rewrite
historical money.

### Evidence state

| State                   | Evidence                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Proposed                | pricing capability in the product objective                                         |
| Policy Decided          | explicit priority, integer adjustment and no-conversion contract in this repository |
| Technically Implemented | domain decision, command/query API, in-memory and PostgreSQL adapters               |
| Repository Verified     | domain/application tests and PostgreSQL test when `DATABASE_URL` is available       |
| Field Validated         | pending depot-owner/worker confirmation of precedence, tiers, discounts and fees    |
| Production Accepted     | not claimed                                                                         |
