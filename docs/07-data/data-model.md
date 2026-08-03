# Data model

Executable persistence truth lives in `packages/db/src/schema/` plus ordered
migrations in `packages/db/migrations/`. This document explains the business role
and mutability of the current schema; it is a mirror, not a replacement for the
Drizzle definitions and database constraints.

## Tables by bounded context

### Identity and workspace

| Table                            | Purpose                                                              | Mutability                              |
| -------------------------------- | -------------------------------------------------------------------- | --------------------------------------- |
| `workspaces`                     | Depot/tenant identity                                                | mutable master data                     |
| `workspace_operational_profiles` | Versioned depot workflow and business-day policy                     | mutable audited policy                  |
| `actors`                         | Attributed command actors; optional Supabase subject link            | mutable master data                     |
| `workspace_memberships`          | One actor access lifecycle plus transitional primary-role projection | mutable lifecycle                       |
| `workspace_membership_roles`     | Normalized fixed-role assignments and assignment attribution         | replaceable set                         |
| `workspace_policies`             | Versioned, evidence-linked workspace policy registry                 | state transition with immutable version |

### Customer, Sale and customer money

| Table                          | Purpose                                                                                     | Mutability                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `customers`                    | Buyer master data                                                                           | mutable lifecycle                                                                |
| `sales`                        | Sale aggregate (`draft → posted/discarded`) with source references and payment-term lineage | draft/status/version only; posted commercial content and term snapshot immutable |
| `sale_lines`                   | Product/grade/quantity/price snapshots for Sale                                             | replaceable while draft; finalized snapshots preserved                           |
| `sale_voids`                   | Posted-Sale compensation/reason with source references                                      | append-only adjacent fact                                                        |
| `payments`                     | Customer money, source references and reversal summary                                      | constrained lifecycle/version fields                                             |
| `payment_reversals`            | Customer-payment compensation and source references                                         | append-only                                                                      |
| `payment_allocations`          | Append-only commercial attribution of a payment to a posted Sale                            | append-only                                                                      |
| `payment_allocation_reversals` | Compensation facts for payment attribution                                                  | append-only                                                                      |
| `customer_account_entries`     | Canonical customer debt ledger                                                              | append-only                                                                      |
| `customer_account_balances`    | Rebuildable customer balance projection                                                     | recomputable                                                                     |
| `customer_orders`              | Commercial Customer Order lifecycle and commercial snapshots                                | draft fields replaceable; confirmed/cancelled state explicit                     |
| `customer_order_lines`         | Customer Order product/name/quantity/price snapshots                                        | replaceable while draft; preserved on confirmation                               |
| `supply_commitments`           | Supplier promise lifecycle and arrival/terms snapshots                                      | commercial-only; no payable or inventory effect                                  |
| `supply_commitment_lines`      | Supplier promise product/grade/quantity/price snapshots                                     | replaceable while draft; preserved on confirmation                               |

### Product, supplier and Purchase

| Table                        | Purpose                                                                   | Mutability                                                        |
| ---------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `products`                   | Workspace product catalog                                                 | mutable lifecycle                                                 |
| `price_rules`                | Effective Product/grade/unit/customer price facts                         | append-only; no historical rewrite                                |
| `quality_grades`             | Workspace commercial-grade vocabulary                                     | mutable lifecycle; historical snapshots remain immutable          |
| `suppliers`                  | Supplier master data                                                      | mutable lifecycle                                                 |
| `supplier_payments`          | Supplier payment aggregate and source references                          | constrained lifecycle/version fields                              |
| `supplier_payment_reversals` | Supplier-payment compensation and source references                       | append-only                                                       |
| `supplier_account_entries`   | Canonical supplier payable ledger                                         | append-only                                                       |
| `supplier_account_balances`  | Rebuildable supplier balance projection                                   | recomputable                                                      |
| `purchases`                  | Purchase aggregate (`draft → confirmed/discarded`) with source references | draft/status/version only; confirmed commercial content immutable |
| `purchase_lines`             | Purchase quantity/price snapshots                                         | replaceable while draft; finalized snapshots preserved            |
| `purchase_voids`             | Confirmed-Purchase compensation/reason with source references             | append-only adjacent fact                                         |

### Receiving and inventory

| Table                        | Purpose                                                   | Mutability                  |
| ---------------------------- | --------------------------------------------------------- | --------------------------- |
| `purchase_receipts`          | Physical inbound source document with source references   | append-only business source |
| `purchase_receipt_lines`     | Received Product/grade/unit quantities                    | append-only                 |
| `purchase_receipt_reversals` | Explicit Receipt reversal facts                           | append-only                 |
| `inventory_movements`        | Canonical physical ledger by Product/QualityGrade/unit    | append-only                 |
| `inventory_balances`         | Rebuildable Product/QualityGrade/unit projection          | recomputable                |
| `stocktake_sessions`         | Policy-linked physical count session and variance lineage | append-only state history   |
| `stocktake_counts`           | Product/QualityGrade/unit count facts within a session    | append-only                 |

### Delivery

| Table                   | Purpose                                                                | Mutability                                                 |
| ----------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| `deliveries`            | Sale-linked fulfilment lifecycle with source references                | draft/status/version only                                  |
| `delivery_lines`        | Exact Sale-line Product/grade/unit quantities to fulfil                | mutable only with draft workflow; preserved after dispatch |
| `delivery_returns`      | Return source facts against dispatched Delivery with source references | append-only                                                |
| `delivery_return_lines` | Exact returned physical quantities                                     | append-only                                                |

### Cashbook

| Table                     | Purpose                                               | Mutability        |
| ------------------------- | ----------------------------------------------------- | ----------------- |
| `cash_accounts`           | Named drawer/bank/wallet/employee-held money location | mutable lifecycle |
| `expenses`                | Operating-expense source facts                        | append-only       |
| `expense_reversals`       | Expense compensation facts                            | append-only       |
| `cash_transfers`          | Internal money-location transfer source               | append-only       |
| `cash_transfer_reversals` | Transfer compensation facts                           | append-only       |
| `cash_adjustments`        | Explained source facts without a better source type   | append-only       |
| `cash_movements`          | Canonical signed money-location ledger                | append-only       |
| `cash_balances`           | Rebuildable per-account projection                    | recomputable      |

### Source-linked operational evidence

| Table                            | Purpose                                                                                                     | Mutability  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------- |
| `cost_observations`              | Exact observed cost/loss wording, money/quantity facts and source references by workspace                   | append-only |
| `reconciliation_observations`    | Separate expected/observed reconciliation facts, scope and source references by workspace                   | append-only |
| `debt_observations`              | Source-linked payment-term, due-date and collection facts by workspace                                      | append-only |
| `supply_commitment_observations` | Source-linked promised/minimum supply, expected-arrival and counterparty facts by workspace                 | append-only |
| `supplier_observations`          | Source-linked supplier relationship, responsibility, timing, quantity, quality and price facts by workspace | append-only |
| `demand_observations`            | Source-linked customer demand, requested quantity/time and counterparty facts by workspace                  | append-only |

`cost_observations` is deliberately not a financial or inventory ledger. A
correction appends a new row linked to the earlier observation; policy-backed
valuation or settlement commands must consume this evidence explicitly after
workspace policy closure.

`reconciliation_observations` is deliberately not a variance, close, cash,
debt, payable or inventory ledger. It preserves expected and observed facts
separately; a correction appends a new row linked to the earlier observation.

`debt_observations` is deliberately not an overdue, allocation, customer
ledger or cashbook source. It preserves what was agreed or observed; a
correction appends a new row linked to the earlier observation.

`supply_commitment_observations` is deliberately not a Purchase, payable,
receipt, inventory, reorder or supplier-score source. It preserves what a
counterparty said or what a worker observed; a correction appends a new row
linked to the earlier observation.

`supplier_observations` is deliberately not a supplier score, ranking, payable,
inventory, claim settlement or recommendation source. It preserves relationship
and performance evidence until an approved workspace policy and canonical
command give that evidence a business meaning.

`demand_observations` is deliberately not a Sale, receivable, inventory,
shortage, forecast or reorder source. It preserves what a customer or
counterparty requested or what a worker observed; a correction appends a new row
linked to the earlier observation.

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
`customer_account_balances`, `supplier_account_balances`, `inventory_balances` and
`cash_balances` are rebuildable projections. Reports are read models over
those canonical sources/projections and are never a second source of truth.

A reconciliation may rebuild a healthy-but-drifted projection. It must not repair a
missing, duplicated or corrupted canonical fact by mutating history.

## Key constraints and indexes

The schema/migrations contain the exact current constraint/index names. The
business-critical categories are:

- workspace-safe composite references;
- unique Supabase subject → Actor mapping where a subject is present;
- unique workspace/actor/role assignments, exclusive `owner`, and a deferred
  consistency check between the normalized role set and transitional primary role;
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
- no general inventory-valuation subsystem; the narrow read-only valuation
  adapter is documented in the inventory read contract and creates no canonical
  financial effect;
- no delivery routing/optimization;
- no full event-sourcing or general double-entry accounting platform;
- no general lot/expiry model and no supplier-quality-claim or credit settlement; inspected intake supports evidence references, quarantine and quality issue snapshots;
- no arbitrary per-person permissions; effective authority is the deterministic union of fixed workspace roles;
- workflow availability is a versioned workspace operational profile, not a per-user flag bag;
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

## Operational-profile executable names

The executable table is `workspace_operational_profiles` and the Drizzle symbol is
`workspaceOperationalProfiles`. Its fields are `purchasing_mode`, `inventory_mode`,
`quality_grade_mode`, `delivery_mode`, `cashbook_mode`, `intake_mode`,
`weighing_mode`, `business_day_start_minute`, `version` and `updated_at`. API procedures are
`session.operationalProfile` and `session.updateOperationalProfile`.

## Cashbook executable names

The Cashbook schema is implemented by these exact PostgreSQL tables and Drizzle
symbols:

| PostgreSQL table          | Drizzle symbol          |
| ------------------------- | ----------------------- |
| `cash_accounts`           | `cashAccounts`          |
| `expenses`                | `expenses`              |
| `expense_reversals`       | `expenseReversals`      |
| `cash_transfers`          | `cashTransfers`         |
| `cash_transfer_reversals` | `cashTransferReversals` |
| `cash_adjustments`        | `cashAdjustments`       |
| `cash_movements`          | `cashMovements`         |
| `cash_balances`           | `cashBalances`          |

`cash_movements` is canonical and append-only; `cash_balances` is disposable and
rebuildable. `payments.cash_account_id` and
`supplier_payments.cash_account_id` preserve the immutable source-account link.
`payments.evidence_references` and `payment_reversals.evidence_references` preserve
source-linked field evidence without changing the canonical money effect.
`supplier_payments.evidence_references` and
`supplier_payment_reversals.evidence_references` do the same for supplier-money
facts. `expenses.evidence_references`, `expense_reversals.evidence_references`,
`cash_transfers.evidence_references`, `cash_transfer_reversals.evidence_references`
and `cash_adjustments.evidence_references` preserve the same source-linked metadata
for standalone cash custody facts. Evidence is metadata only; it does not recognize
payable, imply goods movement or change the canonical cash effect. The same applies
to `sales.evidence_references`, `sale_voids.evidence_references`,
`purchases.evidence_references` and `purchase_voids.evidence_references`: they link
external field evidence without becoming a receivable, payable, inventory or
compensation source. `deliveries.evidence_references` and
`delivery_returns.evidence_references` preserve loading, handover and return
references without becoming an inventory or customer-money source.
`purchase_receipts.evidence_references`, `purchase_receipt_reversals.evidence_references`,
`goods_arrivals.evidence_references`, `goods_arrival_reversals.evidence_references`,
`quality_dispositions.evidence_references` and
`quality_disposition_reversals.evidence_references` preserve receiving and
inspected-intake source links without changing payable, quality-policy or
inventory semantics. `quality_inspections.evidence_references` follows the same
metadata-only rule.
Backup V17 preserves operational profile, price rules, CostObservation,
ReconciliationObservation, DebtObservation, CashAccount and all canonical cash source/
movement rows plus workspace policy versions; it does not export `cash_balances`.
V1–V11 remain restore-compatible with an empty policy collection.

Backup V17 additionally exports and restores `demand_observations` and commercial
`supply_commitments` with their line snapshots. These are
workspace-scoped, append-only source facts with optional customer/product/grade
references; restore validates correction and identity references without creating
Sale, receivable, inventory, forecast or reorder state. V1–V14 restore with an
empty demand-observation collection.

## Executable workspace-policy and cashbook names

The operational-policy table is `workspace_operational_profiles`, exposed by the
Drizzle symbol `workspaceOperationalProfiles`. Its API procedures are
`session.operationalProfile` and `session.updateOperationalProfile`. The stored
policy includes `purchasingMode`, `inventoryMode`, `qualityGradeMode`,
`deliveryMode`, `cashbookMode`, `intakeMode`, `weighingMode`,
`businessDayStartMinute`, `version` and
`updatedAt`.

Cashbook persistence uses the exact Drizzle symbols `cashAccounts`, `expenses`,
`expenseReversals`, `cashTransfers`, `cashTransferReversals`, `cashAdjustments`,
`cashMovements` and `cashBalances`, corresponding to the snake-case PostgreSQL
tables listed above. `cashMovements` is canonical append-only truth;
`cashBalances` is a rebuildable projection. Payment cash-account links are
immutable after recording. Backup V17 exports price rules, CostObservation,
ReconciliationObservation, DebtObservation, CashAccount and canonical source/
movement rows and workspace policy versions, not the disposable balance projection.

## Inspected-intake executable names

| PostgreSQL table                  | Drizzle symbol                  |
| --------------------------------- | ------------------------------- |
| `quality_issue_codes`             | `qualityIssueCodes`             |
| `goods_arrivals`                  | `goodsArrivals`                 |
| `goods_arrival_lines`             | `goodsArrivalLines`             |
| `goods_arrival_reversals`         | `goodsArrivalReversals`         |
| `quality_inspections`             | `qualityInspections`            |
| `quality_inspection_issues`       | `qualityInspectionIssues`       |
| `quality_inspection_reversals`    | `qualityInspectionReversals`    |
| `quality_dispositions`            | `qualityDispositions`           |
| `quality_disposition_allocations` | `qualityDispositionAllocations` |
| `quality_disposition_reversals`   | `qualityDispositionReversals`   |

Arrival, inspection, disposition and reversal tables are append-only. Issue codes are
versioned master data and cannot be deleted. Only accepted allocations create
`inventory_movements`; quarantine, rejection and disposal remain non-stock outcomes.
Backup V17 exports these canonical rows and restore rebuilds inventory balances.
