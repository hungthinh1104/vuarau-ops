# Product roadmap — transaction operating system

## Destination

**vuarau-ops is an operating system for a small wholesale depot:** record every
goods and money transaction as quickly as paper, without losing it, duplicating
it, silently changing it, or making its numbers impossible to explain.

At any time, an owner must be able to answer:

1. What was bought and sold today?
2. Where are the goods: on hand, incoming, or being delivered?
3. Who owes the depot, and whom does the depot owe?
4. Which transactions formed this number?

The destination is not a generic ERP. The differentiator is **transaction
integrity under fast, messy entry and unreliable connectivity**:

- one business action produces one financial effect;
- a retry cannot duplicate a transaction;
- posted history is immutable;
- mistakes are visible compensations, not edits;
- balances trace to their sources;
- the server enforces authority and business rules.

AI, when it exists, only proposes. A user confirms a deterministic command that
passes the normal domain rules and becomes the source of truth.

## Three operating loops

| Loop                | Flow                                                                              | Product promise                                     |
| ------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------- |
| Money Truth         | Customer → Sale → customer debt → payment → correction → reconciliation           | Every customer balance is explainable.              |
| Goods Flow          | Supplier → purchase → receiving → inventory movement → sale fulfilment → delivery | Every goods movement is attributable.               |
| Operational Control | Workspace → members and roles → backup/restore → incidents → audit → reports      | A depot can operate without developer intervention. |

Money Truth comes first. Goods Flow is not an excuse to weaken its invariants;
Operational Control is what makes the product independently operable.

## Roadmap rule

A milestone must do at least one of the following:

1. close an incomplete workflow;
2. remove a dependency on a developer; or
3. create a prerequisite for the next bounded context.

New work must make capture faster, truth stronger, numbers more explainable, or
the depot more self-sufficient. A feature that does none of these is outside the
current roadmap.

## Current position

The trusted-sale foundation exists: command-based writes, Sale lifecycle,
customer ledger, payment/reversal, void/replacement invariants, audit, explicit
historical-price recall, and the Quick Sale/Sale detail flow. This establishes a
**trusted sales ledger**, not evidence that a real depot has adopted it.

Automated verification proves contracts and integration behavior. Real-worker
usability or operational readiness still needs separately recorded field
evidence; see [validation-plan.md](validation-plan.md).

## Near-term execution — lock only these milestones

### M8 — Sale Correction UI (completed)

Close the correction workflow using existing `VoidSale`, `CreateSaleDraft`,
`PostSale`, and command-recovery behavior. Do not create a second correction
engine.

- owner/accountant capability checks;
- void-only or void-and-replace, with reason and explanation;
- prefilled replacement and reload/drop-response recovery;
- no duplicate void/replacement;
- two-way correction chain and a visible `+old sale → -void → +replacement`
  timeline.

The governing invariant remains: a posted Sale is immutable; a correction is a
void plus, when needed, a distinct replacement Sale.

The workflow is covered through the real browser/API/Postgres stack, including a
dropped void response replay. This is technical evidence only; it is not evidence
that a depot has adopted the workflow.

### M9 — Payment & account operations (completed)

Bring existing Money Truth workflows out of shell-only operation:

- record and reverse payment under current rules;
- opening balance, write-off, dispute settlement, and manual debt adjustment;
- account timeline and balance reconciliation.

Every adjustment requires operation type, reason, actor, and audit. It must not
be a hidden way to correct a Sale.

Technical evidence: payment reversal and debt-adjustment recovery, server-projected
detail reads, and cursor-paged customer account timeline are covered by automated
tests. This is not evidence of real-depot adoption.

### M10 — Financial reconciliation (completed)

Provide the answer to: **Why is this customer's balance X?**

- current balance, complete entry count and timeline;
- source transaction links;
- projection-versus-ledger consistency and missing/duplicate-source detection;
- privileged projection rebuild and evidence export.

The browser and API now expose a typed `consistent | inconsistent | not_found |
integrity_failure` result. Projection-only drift can be rebuilt by an authorized
owner/accountant with an idempotent command and before/after audit evidence.
Source or ledger corruption is reported and cannot be repaired by that command.

### M11 — Workspace, members and roles (completed)

- owner-only member list and existing-account enrollment;
- role change, revocation and reactivation with audit history;
- last-owner, self-role-change, stale-role and workspace-isolation guards;
- authorization is re-read on the next request rather than cached in the browser.

Identity-provider account provisioning is still external. The product can manage
roles for authenticated accounts; it does not send invitations or create login
credentials.

### M12 — Customer operations (completed)

- create, edit, deactivate and reactivate without changing the ledger;
- active/inactive filtering and cursor pagination;
- duplicate-name/phone candidates are surfaced but never auto-merged;
- customer detail retains balance, account history and links to source documents.

**Horizon 1 gate:** a depot can sell, take payment, correct mistakes, and explain
customer debt without a developer. The M11/M12 self-service workflows are
technically verified; real-worker adoption remains unproven.

## Later horizons — direction, not an implementation plan

### M13 — Offline Quick Sale (technical evidence complete)

IndexedDB persists actor/workspace-partitioned drafts and immutable command
chains. Reload, retry and reconnect preserve command identity; local state is not
presented as server-posted truth. The browser shell, cached customer/catalog reads
and global sync status cover the field capture path.

### M14 — Reliability & operations (technical evidence complete)

The owner operations surface provides sync state, workspace integrity, a
versioned checksummed logical backup, validation and an atomic, idempotent restore
to an empty recovery target. Restore rebuilds projections and requires a healthy
integrity read before success. Infrastructure PITR remains a deployment concern.

### M15 — Product catalog (technical evidence complete)

Product identity, lifecycle, cursor search, permissions, offline read cache and
Sale snapshot integration are implemented. Pricing rules are now a separate
append-only catalogue slice; this does not authorize automatic pricing,
valuation, supplier, purchase, inventory or unit-conversion policy.

### M16 — Supplier account (technical evidence complete)

Supplier lifecycle, payment/reversal, explicit adjustment, append-only payable
ledger, source-linked timeline, reconciliation and safe projection rebuild are
implemented. Negative supplier credit is supported.

### M17 — Purchase lifecycle (technical evidence complete)

Purchase draft/confirm/discard, immutable void/replacement correction and exact
supplier-payable effects are implemented. Confirmation moves money but not
physical quantity.

### M18 — Receiving and inventory movements (technical evidence complete)

Partial Receipt capture, full reversal, over-receipt protection, immutable
per-line movements, the original per-Product/unit projections, adjustments and
reconciliation were implemented. M23.8 later superseded the projection identity with
Product/QualityGrade/unit. Inbound Goods Truth was the M18 boundary; outbound Sale
fulfilment remained the explicit M19 boundary.

### M19 — Sale fulfilment and delivery (technical evidence complete)

Delivery models physical fulfilment separately from Sale financial status.
Partial dispatches and explicit returns create attributable outbound and
compensating inventory movements without changing customer debt. PostgreSQL
concurrency evidence prevents over-fulfilment.

### M20 — Immutable documents and secure sharing (technical evidence complete)

Sale receipt, customer statement, purchase order, and delivery note are frozen,
versioned source snapshots with deterministic digests. Public sharing stores
only token hashes and fails closed on expiry, revocation, or tampering.

### M21 — Source-backed operational reports (technical evidence complete)

`customer_account_activity`, receivables, payables, per-unit inventory, inventory
movement, and outstanding-delivery reads reconcile to canonical sources, expose
integrity state, paginate deterministically, link to source detail, and export
CSV. `customer_account_activity` is deliberately limited to customer ledger
activity; receiving, inventory, and Delivery events belong to their separate
source-backed reports.

### M21.5 — Integrity and maintainability hardening (technical evidence complete)

- a voided Sale rejects new Delivery creation, editing, and dispatch while
  preserving explicit returns against already-dispatched Deliveries;
- PostgreSQL makes document snapshots append-only, authenticated reads verify
  their digest, and restore rejects a mismatched snapshot atomically;
- DB read/write repositories, in-memory persistence, tRPC routers, and the Quick
  Sale screen are split by bounded context behind their existing exports;
- `source:check` enforces declared composition entry points at 250 lines with no
  raw SQL, warns ordinary source files above 450 lines, and fails them above 700.

### M21.6 — Product policy and vision closure (technical evidence complete)

- ASM-024–031 classify the remaining recognition, business-day, negative-stock,
  adjustment, delivery-cash, data-policy and recovery-policy questions without
  inventing depot answers;
- owner worksheets make Sale and supplier-payable recognition explicit pre-live
  gates;
- the product brief, delivered scope, H1–H6 validation plan, use-case surface,
  state/transition catalogs and product-level invariants now describe Money
  Truth, Goods Flow and Operational Control as one transaction system;
- traceability points through bounded-context implementations after M21.5
  modularization.

### M22 — Production hardening (technical evidence complete; deployment gate remains)

- production-shape PostgreSQL evidence covers 10k customers/products, 100k
  Sales/Purchases and one million ledger/movement rows against fixed p95 budgets;
- workspace-wide report pages now use database keyset pagination and measured
  indexes rather than loading a tenant into application memory;
- authenticated/public request limits, CSV formula protection, encrypted backup
  envelopes, authorization-surface checking and ADR-0020 close repository-owned
  trust boundaries;
- health, safe query/command/integrity metrics, alerts and request→receipt→audit→
  source correlation make incidents diagnosable;
- fresh migration, production-shape migration and logical restore/failure drills
  are recorded. Provider PITR and owner acceptance remain hard deployment gates,
  not claimed repository evidence.

### M23 — Shadow-pilot readiness (repository evidence pending; pilot blocked/pending)

- `603e830` is the pre-M23 baseline; every evidence packet is bound to the exact
  deployed full SHA and the depot notebook remains operational truth;
- audited first-owner bootstrap, authenticated member commands, effective-role
  review and fail-closed readiness declarations prepare one isolated workspace;
- Customer and Product CSVs dry-run, validate every row, surface duplicate
  candidates and replay deterministic real commands without demo seeding;
- the disposable dry-run composes existing real browser/API/PostgreSQL workflows
  with request/readiness failures instead of duplicating their scenarios;
- the application exposes password-only Supabase login without overstating the
  hosted provider's unobservable passwordless capability; a real two-account
  same-tab smoke remains external evidence;
- the role-aware desktop/mobile shell, explicit workspace/user context, Sale and
  Delivery entry lists and permission-backed Today actions close the bounded
  navigation gaps needed for a real worker;
- M23.7–M23.9 close the pre-pilot Sale→Delivery integrity defect: PostSale now
  requires current canonical Product and QualityGrade identity before debt,
  Quick Sale resolves/creates Product inline, fulfilment exposes exact remaining
  quantities, and Delivery consumes the exact Product/grade/unit;
- configurable workspace grades, split-grade Receiving, grade-separated
  inventory, conserving reclassification, attributable spoilage, BackupV4
  compatibility and responsive source-backed management queues are technically
  proven without rewriting legacy unclassified history;
- H2–H6 criteria, P0–P3 stop rules, deployment/recovery evidence and support
  runbooks are frozen.

The repository-truth and critical-screen Storybook reconciliation is now technically
closed: every critical screen in `docs/08-qa/ui-screen-coverage.md` has a shared
presentation View and executable Storybook states. Repository readiness remains
**PENDING** because M23.14–M23.17 still have to close business-use-case completeness
and cross-dimension correction semantics; visual coverage is not product
completeness.

Pilot readiness is **BLOCKED/PENDING** until the real Supabase A→B smoke,
ASM-023/024/025, ASM-017/018, ASM-030, ASM-032/033/034, ASM-035/036/037/038,
real-phone deployment and provider PITR/RPO/RTO/restore evidence are actually
recorded. M24 Cashbook and M25 inspected-intake code are technically implemented;
they do not remove the remaining owner-policy, field-validation or deployment gates.

#### M23.10–M23.13 — Repository truth, UI-state and quality gates (technical closure)

- current code/contracts, data model and authoritative docs were reconciled;
- the UI-state catalog and all critical operational screens have Storybook-backed
  presentation states rather than component-only examples;
- commercial Grade is explicitly bounded from Condition/Defect/inspection policy;
- repository truth checks fail on API/data/docs/navigation/decision/UI drift.

#### M23.14 — Use-case completeness audit (current)

- evaluate actor × business event × money/goods/control effects rather than counting
  procedures as product completeness;
- decompose umbrella Supplier/Purchase/Receiving/Inventory/Delivery/Document/
  Operations use cases only where actor goal or risk really differs;
- classify each uncovered event as implemented, policy-blocked, missing/discovery,
  or deliberately out-of-scope;
- use `docs/02-use-cases/use-case-completeness-audit.md` as the working audit.

#### M23.15 — Cross-dimension correction closure

Resolve ASM-035–038 before feature implementation. Sale correction after Delivery,
Purchase correction after Receiving, partial customer returns, and Supplier returns
must preserve historical physical facts without manufacturing fake movements.
A policy answer that changes canonical facts requires ADR/rule/case/test/restore
review.

#### M23.16 — Field-policy closure

Close the owner/worker questions that can invalidate current pilot semantics:
recognition moments, role table, Grade requirement, Receiving acceptance, Grade
management authority, pricing precedence/adjustments, sensitive-action approval,
delivery cash handling and cross-dimension corrections. The pilot declaration now
carries explicit ASM-020, ASM-029 and UC-PRICING-001 review/stop gates; no
seeded/default category counts as owner evidence.

#### M23.17 — Full depot-day rehearsal

Run a synthetic day through Supplier → Purchase → Receiving → Inventory → Sale →
Delivery → Return → Payments/corrections → reports/reconciliation, including
partial operations, unknown outcomes and mistakes. The rehearsal may only use
business events the model can represent truthfully; a fake compensating movement
to make a screen look complete is a failure.

**Operational-profile closure:** ADR-0024 implements an owner-selected, versioned and audited workspace profile for Purchasing, Inventory, commercial Grade, Delivery, Cashbook, direct versus inspected Intake, weighing mode and the business-day boundary. Disabled workflows reject new commands server-side while historical reads/reversals and Backup V17 remain intact. This is not a generic rule builder.

**Policy-registry closure:** ADR-0028 adds a workspace-scoped versioned registry
with typed bounded-context adapters. Drafts are inactive; approval requires
evidence, reason, actor and audit; availability fails closed outside an effective
window. Backup V17 preserves the registry, commercial supply commitments, raw
supply commitments, supplier observations and customer demand observations while
V1–V16 restore with no policy or evidence rows introduced later. The narrow
inventory-valuation adapter is now source-backed, effective-dated and fail-closed;
it does not activate receivable/payable recognition, COGS/profit, aging, reorder,
supplier scoring, cash forecasts or AI decisions.

**Document/bill closure:** ADR-0023 and TC-DOCUMENT-003 implement a source-backed
multi-day customer statement with server-derived opening/change/closing balances and
print-ready authenticated/public presentation. This does not close the local
“bông hàng” discovery question, multi-role authorization (ADR-0021), canonical
lot/expiry traceability or Supplier claim/credit settlement.

**Cashbook closure:** ADR-0025 separates physical cash location from debt/payable ledgers. CashAccount, Expense, Transfer, Adjustment, exact reversals, rebuild, reconciliation and Backup V17 evidence are implemented. Operational close and bank-statement evidence remain separate next-phase facts; no statement match changes debt by itself.

**Inspected-intake closure:** ADR-0026 implements GoodsArrival → optional gross/tare/net → QualityInspection → QualityDisposition. Only accepted allocations create inventory; quarantine may be resolved through an explicit child disposition; correction is downstream-first and Backup V17 preserves the complete lineage. Supplier claims/credits, general lot/expiry and “bông hàng” remain outside this milestone, while raw claim/quality evidence can be captured later without changing payable.

**Repository evidence:** `TC-OPS-015` runs the complete application command chain
with partial Delivery/Return, customer and Supplier payments, exact-identity retry,
blocked cross-dimension corrections, reports and three reconciliations. Disposable
PostgreSQL/browser execution and worker observation remain release/field gates; this
test does not claim either.

### Evidence capture foundation — first slice delivered, remainder pending

The configurable operating model in [ADR-0027](../09-decisions/ADR-0027-configurable-fresh-produce-operating-model.md)
opens a narrow additive slice before management intelligence. The first
workspace-scoped `CostObservation` slice and the second
`ReconciliationObservation` and `DebtObservation` slices now capture source-linked facts with exact
amounts/quantities, separate expected/observed values, debt terms, read, idempotent retry and
logical backup/restore coverage. Promised/arrived/accepted
quantities, customer demand/order requests and Supplier relationship/performance
observations are now available as raw evidence; policy-backed stocktake sessions
and fixed-threshold planning are now separate traced adapters. Bank statement
matching remains raw evidence only. New records must
carry actor and transaction/recorded time, remain append-only or explicitly
superseding, and survive backup/restore.

The delivered slice is still not a COGS/profit implementation. It must not create
COGS, overdue aging, reorder risk, supplier scores or AI advice. Each remaining
fact will be added as a small traced slice with in-memory, PostgreSQL and recovery
evidence.

### Next phase — policy closure before management intelligence (blocked)

The decision-operating-system phase cannot begin with COGS, aging, reorder,
Supplier scoring, recommendations or AI. ASM-039–048 must first be answered with
field examples and recorded evidence. The [policy-closure worksheet](../09-decisions/policy-closure-worksheet.md)
is the field instrument; until then these capabilities remain explicitly
policy-blocked and current canonical transaction/report surfaces remain the only
available truth.

| Horizon                               | Milestones                                                                | Gate                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 2 — self-service and field resilience | M11–M14 technically complete                                              | Onboard, authorize, operate on weak networks, back up and recover without a developer. |
| 3 — goods and inputs                  | M15–M18 technically complete                                              | Supplier money and inbound goods flows are source-traceable.                           |
| 4 — depot operations                  | M19–M22 technically complete; provider recovery evidence gates deployment | Operational views meet measured budgets and production trust boundaries fail closed.   |
| 5 — intelligence                      | assisted capture, matching, recommendations, forecasting                  | Vocabulary, catalog, deterministic workflows, policy and corpus are mature.            |

The depot-operations batch and M21.5–M23 hardening close repository-owned
technical evidence through shadow-pilot readiness. Provider PITR, owner policy
answers, real-phone evidence and field observations are external blockers, not
reasons to invent evidence in this book.

## Maturity stages

| Stage                         | Definition                                                               |
| ----------------------------- | ------------------------------------------------------------------------ |
| A — Trusted sales ledger      | Sale, payment, correction, and balance are correct.                      |
| B — Operationally independent | The depot can onboard, authorize, correct, back up, and recover.         |
| C — Full depot operations     | Purchase, supplier, inventory, and delivery share the transaction model. |
| D — Intelligence              | Reports first; AI only accelerates stable manual workflows.              |

## Related

- [product-brief.md](product-brief.md)
- [scope.md](scope.md)
- [validation-plan.md](validation-plan.md)
- [ADR-0012 — sale void and replacement](../09-decisions/ADR-0012-sale-void-and-replacement.md)
