# Data model

Executable persistence truth lives in `packages/db/src/schema/` plus ordered
migrations in `packages/db/migrations/`. This document explains the business role
and mutability of the current schema; it is a mirror, not a replacement for the
Drizzle definitions and database constraints.

## Tables by bounded context

### Identity and workspace

| Table                   | Purpose                                                   | Mutability          |
| ----------------------- | --------------------------------------------------------- | ------------------- |
| `workspaces`            | Depot/tenant identity                                     | mutable master data |
| `actors`                | Attributed command actors; optional Supabase subject link | mutable master data |
| `workspace_memberships` | Actor role and active membership per workspace            | mutable lifecycle   |

### Customer, Sale and customer money

| Table                       | Purpose                                         | Mutability                                                     |
| --------------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| `customers`                 | Buyer master data                               | mutable lifecycle                                              |
| `sales`                     | Sale aggregate (`draft → posted/discarded`)     | draft/status/version only; posted commercial content immutable |
| `sale_lines`                | Product/grade/quantity/price snapshots for Sale | replaceable while draft; finalized snapshots preserved         |
| `sale_voids`                | Posted-Sale compensation/reason                 | append-only adjacent fact                                      |
| `payments`                  | Customer money received and reversal summary    | constrained lifecycle/version fields                           |
| `payment_reversals`         | Customer-payment compensation facts             | append-only                                                    |
| `customer_account_entries`  | Canonical customer debt ledger                  | append-only                                                    |
| `customer_account_balances` | Rebuildable customer balance projection         | recomputable                                                   |

### Product, supplier and Purchase

| Table                        | Purpose                                            | Mutability                                                        |
| ---------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| `products`                   | Workspace product catalog                          | mutable lifecycle                                                 |
| `quality_grades`             | Workspace commercial-grade vocabulary              | mutable lifecycle; historical snapshots remain immutable          |
| `suppliers`                  | Supplier master data                               | mutable lifecycle                                                 |
| `supplier_payments`          | Supplier payment aggregate                         | constrained lifecycle/version fields                              |
| `supplier_payment_reversals` | Supplier-payment compensation facts                | append-only                                                       |
| `supplier_account_entries`   | Canonical supplier payable ledger                  | append-only                                                       |
| `supplier_account_balances`  | Rebuildable supplier balance projection            | recomputable                                                      |
| `purchases`                  | Purchase aggregate (`draft → confirmed/discarded`) | draft/status/version only; confirmed commercial content immutable |
| `purchase_lines`             | Purchase quantity/price snapshots                  | replaceable while draft; finalized snapshots preserved            |
| `purchase_voids`             | Confirmed-Purchase compensation/reason             | append-only adjacent fact                                         |

### Receiving and inventory

| Table                        | Purpose                                                | Mutability                  |
| ---------------------------- | ------------------------------------------------------ | --------------------------- |
| `purchase_receipts`          | Physical inbound source document                       | append-only business source |
| `purchase_receipt_lines`     | Received Product/grade/unit quantities                 | append-only                 |
| `purchase_receipt_reversals` | Explicit Receipt reversal facts                        | append-only                 |
| `inventory_movements`        | Canonical physical ledger by Product/QualityGrade/unit | append-only                 |
| `inventory_balances`         | Rebuildable Product/QualityGrade/unit projection       | recomputable                |

### Delivery

| Table                   | Purpose                                                 | Mutability                                                 |
| ----------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| `deliveries`            | Sale-linked fulfilment lifecycle                        | draft/status/version only                                  |
| `delivery_lines`        | Exact Sale-line Product/grade/unit quantities to fulfil | mutable only with draft workflow; preserved after dispatch |
| `delivery_returns`      | Return source facts against dispatched Delivery         | append-only                                                |
| `delivery_return_lines` | Exact returned physical quantities                      | append-only                                                |

### Documents and control

| Table              | Purpose                                                | Mutability                                |
| ------------------ | ------------------------------------------------------ | ----------------------------------------- |
| `documents`        | Immutable versioned source snapshots and digest        | append-only                               |
| `document_shares`  | Hashed capability-token records                        | revocation/expiry lifecycle fields only   |
| `command_receipts` | Idempotency coordination and committed result identity | insert plus constrained completion update |
| `audit_logs`       | Attributed business-action history                     | append-only                               |

## Cross-cutting conventions

### Workspace isolation

Business rows carry workspace identity and repositories accept workspace context as
a required boundary. Composite keys/foreign keys are used where an id alone would
allow a cross-workspace reference. Application authorization is the primary
isolation layer under ADR-0020; provider/database defence-in-depth must not be
confused with permission to omit workspace checks in repositories.

### Exact money and quantity

Money is stored as integer minor units with explicit currency. Physical quantities
use integer scaled values plus explicit unit. No canonical ledger or movement uses
floating-point arithmetic, and incompatible units are never silently converted.

### Time

Business events preserve `transaction_time` separately from recording/system
timestamps. Back-dated entry changes when the business event occurred, not when the
system learned it.

### Optimistic concurrency

Mutable aggregates expose integer versions where a stale edit can overwrite another
worker's intent. Append-only facts and operations whose concurrency guarantee is a
row lock/uniqueness constraint do not gain a version merely to look uniform.

### Immutable history and compensation

Finalized money/goods facts are corrected by adjacent or inverse facts: Sale void,
Payment reversal, Purchase void, Receipt reversal, Delivery return, inventory
adjustment/reclassification. Historical transaction meaning is not rewritten to
make a projection look right.

Database triggers/constraints in migrations enforce the high-risk append-only and
no-delete boundaries in addition to application code. The migration definitions,
not this paragraph, are authoritative about the exact trigger set.

## Grade-aware physical identity

Current inventory projection identity is:

```text
workspace + Product + QualityGrade + unit
```

New physical workflows preserve canonical grade id plus human-readable snapshots
where documents/history require them. Nullable grade columns exist only to retain
immutable history created before grade tracking; migrations do not assign an
arbitrary grade to old facts. Projection uniqueness treats the legacy/unclassified
bucket deterministically rather than allowing duplicate null-key balances.

QualityGrade is commercial classification master data. It is not Product identity,
condition/defect inspection, batch/lot tracking or supplier-claim state.

## Canonical truth versus projections

Canonical sources include customer/supplier account entries and inventory
movements plus the immutable business documents/events that explain them.
`customer_account_balances`, `supplier_account_balances` and
`inventory_balances` are rebuildable projections. Reports are read models over
those canonical sources/projections and are never a second source of truth.

A reconciliation may rebuild a healthy-but-drifted projection. It must not repair a
missing, duplicated or corrupted canonical fact by mutating history.

## Key constraints and indexes

The schema/migrations contain the exact current constraint/index names. The
business-critical categories are:

- workspace-safe composite references;
- unique Supabase subject → Actor mapping where a subject is present;
- command/idempotency uniqueness preventing duplicate command effects;
- source uniqueness preventing a second ledger effect for the same business source;
- one rebuildable balance row per canonical projection key;
- keyset/timeline indexes aligned with bounded read ordering;
- Product/QualityGrade/unit inventory projection uniqueness including the explicit
  legacy/unclassified bucket.

Avoid copying every physical index into this document: query/performance evidence is
maintained with the repository implementation, where it can be tested.

## Deliberately absent or unresolved

- no `customers.balance` or `suppliers.balance` source-of-truth columns;
- no Sale `paid/unpaid` status: Payments are not allocated to individual Sales;
- no hard delete of finalized financial/physical history;
- no unit conversion engine;
- no tax-invoice or inventory-valuation subsystem;
- no delivery routing/optimization;
- no full event-sourcing or general double-entry accounting platform;
- no lot/batch, expiry, quarantine, defect/photo or supplier-quality-claim model;
- no AI-owned write path;
- row-level security is not the primary authorization mechanism; see ADR-0020.

The boundary around QualityGrade is intentionally narrower than "quality
management". Whether grade is required/optional/not-applicable for different goods,
and how receiving rejection/damage affects supplier obligations, remains a policy
question to close before expanding the schema.

## Related

- [ledger-model.md](ledger-model.md)
- [time-semantics.md](time-semantics.md)
- [../00-product/product-invariants.md](../00-product/product-invariants.md)
- [../04-business-rules/goods-flow-rules.md](../04-business-rules/goods-flow-rules.md)
- [../09-decisions/ADR-0020-application-workspace-isolation.md](../09-decisions/ADR-0020-application-workspace-isolation.md)
