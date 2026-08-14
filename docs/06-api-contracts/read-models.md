# Read models

Executable DTO schemas live in `packages/domain-contracts/src/*/index.ts` and the
current authenticated tRPC surface is composed in
`apps/api/src/infrastructure/trpc/router.ts`. PostgreSQL query implementations live
under `packages/db/src/repositories/read/`; application handlers apply the shared
read/authorization pipeline. This document records read-side invariants and the
current procedure catalog without duplicating every DTO field.

## Current read surface

| Namespace          | Reads                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `session`          | `me`, `workspaces`, `workspace`, `operationalProfile`                                                                                                                                                                                                                                                                                      |
| `customer`         | `search`, `get`, `recent`, `duplicates`                                                                                                                                                                                                                                                                                                    |
| `account`          | `adjustment`, `balance`, `timeline`, `reconciliation`, `aging`, `reconciliationEvidence`                                                                                                                                                                                                                                                   |
| `sale`             | `get`, `list`, `captureContext`, `detail`                                                                                                                                                                                                                                                                                                  |
| `customerOrder`    | `get`, `list`                                                                                                                                                                                                                                                                                                                              |
| `supplyCommitment` | `get`, `list`                                                                                                                                                                                                                                                                                                                              |
| `payment`          | `get`, `list`                                                                                                                                                                                                                                                                                                                              |
| `audit`            | `timeline`                                                                                                                                                                                                                                                                                                                                 |
| `product`          | `search`, `get`                                                                                                                                                                                                                                                                                                                            |
| `quality`          | `list`, `get`                                                                                                                                                                                                                                                                                                                              |
| `supplier`         | `search`, `get`, `priceHistory`, `performance`, `getPayment`, `getAdjustment`, `balance`, `timeline`, `reconciliation`, `evidence`                                                                                                                                                                                                         |
| `purchase`         | `get`, `list`                                                                                                                                                                                                                                                                                                                              |
| `receiving`        | `get`, `listForPurchase`, `summaryForPurchase`                                                                                                                                                                                                                                                                                             |
| `inventory`        | `balances`, `coverage`, `getAdjustment`, `timeline`, `valuation`, `planning`, `stocktakeGet`, `reconciliation`, `evidence`                                                                                                                                                                                                                 |
| `delivery`         | `get`, `list`, `fulfilment`                                                                                                                                                                                                                                                                                                                |
| `document`         | `get`, `listForSource`                                                                                                                                                                                                                                                                                                                     |
| `report`           | `definitions`, `metrics`, `intelligence`, `operational`, `csv`                                                                                                                                                                                                                                                                             |
| `dashboard`        | `summary`, `salesSeries`, `orderStatusCounts`, `topProducts`, `operationsBoard`, `operationsBoardCounts`                                                                                                                                                                                                                                   |
| `operations`       | `integrity`, `validateBackup`, `getClose`, `listCloses`, `closeReadiness`                                                                                                                                                                                                                                                                  |
| `cash`             | `searchAccounts`, `getAccount`, `timeline`, `getExpense`, `getTransfer`, `reconciliation`, `statementMatches`, `getStatementMatch`                                                                                                                                                                                                         |
| `intake`           | `searchIssueCodes`, `getArrival`, `listArrivals`, `getInspection`, `getDisposition`, `dispositionSourceSummary`, `arrivalLineHistory`                                                                                                                                                                                                      |
| `pricing`          | `list`, `resolve`                                                                                                                                                                                                                                                                                                                          |
| `evidence`         | `getCostObservation`, `listCostObservations`, `getReconciliationObservation`, `listReconciliationObservations`, `getDebtObservation`, `listDebtObservations`, `getSupplyCommitmentObservation`, `listSupplyCommitmentObservations`, `getSupplierObservation`, `listSupplierObservations`, `getDemandObservation`, `listDemandObservations` |
| `policy`           | `get`, `list`, `availability`                                                                                                                                                                                                                                                                                                              |

The router source is authoritative for procedure names. Permission policy belongs
to [authorization-rules.md](../04-business-rules/authorization-rules.md), and DTO
field shapes belong to domain contracts.

## Identity and authorization

All private business reads require a verified Supabase bearer token. Workspace
reads resolve the local Actor and active membership before returning business
data. `session.workspaces` is special because it runs before a workspace can be
selected and therefore derives the actor entirely from the verified subject;
`session.me`/`session.workspace` then operate in explicit workspace context.

A revoked or missing membership is not papered over by a client filter. The server
is authoritative on every request, so role/membership changes take effect without
waiting for a browser session cache to expire.

Public document lookup is the sole deliberate unauthenticated business-data
exception. It is token scoped, non-enumerable and read-only, with digest, expiry
and revocation validation.

## Published read invariants

A read model is an explicit projection, never a raw database row:

- DTOs are field-by-field published contracts;
- money and quantity remain integer representations;
- business time and recorded time stay distinct where both are meaningful;
- derived classifications come from server/domain rules rather than client sign or
  status guessing;
- capabilities are advisory views of the same permission/business rules that the
  command will re-check;
- workspace/source identifiers necessary for traceability are preserved;
- projections and reports are disposable views over canonical sources.

## Goods and fulfilment identity

Current physical truth is keyed by `Product + QualityGrade + unit` within a
workspace. `inventory.balances` returns separate rows for each grade/unit bucket;
legacy immutable rows that predate grade tracking remain explicitly unclassified
rather than being assigned an invented grade.

`inventory.timeline` can scope by Product, grade and unit and preserves movement
source attribution. Reclassification remains two canonical movements, not a
rewritten balance.

`inventory.coverage` is a bounded Product batch read used by the operational
goods directory and Product detail. For every requested Product and unit it
returns physical on-hand quantity, remaining quantity on confirmed non-voided
Purchases, remaining fulfilment on posted non-voided Sales, and
`onHand + inboundRemaining - outboundRemaining`. Active Receipt and accepted
inspection-disposition facts reduce Purchase remaining; Dispatch and Return facts
reduce or restore Sale remaining. Units are never converted or combined. Customer
Orders and supply commitments are intentionally excluded until explicit conversion
lineage can prevent double counting. This projection does not replace canonical
inventory balances, Purchase receiving progress or Sale fulfilment reads.

The coverage batch deliberately aggregates all QualityGrade buckets for the same
Product and unit. That aggregation answers the operational question “how much of
this Product is available after commitments?”; it does not claim that one grade
can satisfy a requirement for another grade. Grade-specific truth remains in
`inventory.balances`, the inventory timeline and the source fulfilment/read models.

`inventory.valuation` is a read-only, workspace-policy-backed result at an
explicit `asOf` time. It derives inventory value from canonical movement facts
and Receipt → immutable Purchase-line cost lineage. Missing policy, incomplete
lineage, mixed currency, negative inventory or missing specific-cost lot
references return `unavailable`; the client must not substitute a numeric
estimate. This narrow result does not publish COGS, profit, margin or landed-cost
effects.

`sale.captureContext` carries canonical historical `productId` when the historical
line has one. Legacy history with no Product id remains an unresolved suggestion;
display name is never promoted to canonical identity implicitly.

`supplier.priceHistory` is an observed source read over confirmed Purchase-line
snapshots. It preserves Product identity, quantity, unit price, Purchase id and
business/recording timestamps, with optional Product filtering and keyset
pagination. Draft/discarded Purchases are excluded. It is not a normalized price,
margin, recommendation or supplier-performance score.

`supplier.performance` is a policy-backed descriptive read over non-superseded
`SupplierObservation` facts for one Supplier and one workspace. It resolves the
effective approved `supplier_evaluation` policy, returns integer quantities/rates,
policy and calculation versions, and exposes `sourceObservationIds` for lineage.
Quantity rates require an explicit shared `supplierObservationGroupId` linking
promise and outcome facts; unrelated observations are never paired. Missing or
invalid policy/evidence returns `unavailable`; the read never ranks, recommends
or creates a financial, inventory or claim effect.

`delivery.fulfilment` is derived from Sale, Dispatch and Return facts and exposes
ordered, dispatched, returned, net-fulfilled and remaining quantities plus an
attention/integrity condition when the facts cannot support a normal fulfilment
path. Clients do not recompute this model.

## Reports

`report.operational` and `report.csv` are two representations of the same
source-backed report model. Current report families cover customer account
activity, receivables, payables, grade-aware inventory, inventory movements and
outstanding delivery work.

`report.definitions` is an authenticated, versioned semantic contract for those
currently implemented operational reports. Each entry states its measure,
canonical or rebuildable source relations, business-time semantics, supported
and ignored filters, integrity behavior and drill-down action. The registry does
not claim that COGS, margin, debt aging or reorder-risk metrics exist. Supplier
performance is a separate descriptive, policy-backed read and is not a score or
recommendation. `report.metrics` makes the remaining candidates explicit as
`unavailable`, with their policy gates and next evidence, until their business
policies and source facts are agreed and implemented. Neither read returns a
numeric fallback for an unavailable metric. The contract rejects an `available` or
`degraded` metric unless formula, canonical sources, included/excluded states,
business time, scope, freshness, integrity behavior, drill-down and action are
all present. Web Reports renders the same catalog as a read-only evidence panel;
a catalog read failure is surfaced as a read failure, not as an empty or numeric
metric state.

`report.intelligence` is a read-only operational snapshot selected by an effective
approved `management_intelligence` policy. It copies totals from the selected
operational reports and returns the policy version, strategy and source report
types. It fails closed when policy or source integrity is unavailable and makes no
COGS, profit, forecast, score, recommendation or new ledger/inventory/cash claim.

Inventory report rows preserve Product/QualityGrade/unit identity. An aggregate
across grades, when shown for information, must be labelled as an aggregate rather
than presented as one canonical inventory balance. CSV does not introduce a
second calculation path.

## Pagination and ordering

Unbounded browser reads are not part of the public contract. Lists/timelines use
bounded requests and deterministic keyset cursors appropriate to their business
sort key. The cursor is opaque to clients; both the sort value and stable id are
part of ordering so equal timestamps/names cannot skip or duplicate rows at a page
boundary.

Common patterns include:

```text
WHERE (sort_column, id) < (:sortValue, :id)
ORDER BY sort_column DESC, id DESC
LIMIT :limit + 1
```

Ascending catalogs/searches use the corresponding ascending predicate/order.
Business timelines generally order by `transactionTime`; audit answers when the
system recorded actions and therefore uses recording order where specified by its
contract.

Operational Board counts describe the complete server-side search scope and are
independent of the currently selected filter chip. `updatedAt` is the latest
recorded canonical fact that can change a row's commercial, physical, financial
or next-action state; it is not merely the original Sale/Purchase timestamp.
Valid zero-value posted Sales still count as orders. Mobile Board cards expose
commercial, physical and financial state together. A row with
`returnedFulfilment=true` has a canonical Delivery Return and remains a physical
work-queue signal in the dedicated `returned_fulfilment` filter. A separate
`return_settlement_unresolved` exception appears while any Return on the Sale
lacks a settlement fact; its next action is to record the return consequence.
V1's only supported resolution is `goods_only`, which explicitly has no money
effect. Neither signal infers a credit, refund, exchange or customer-debt effect.
Likewise, a positive Sale remainder is ordinary fulfilment workflow until an
explicit `fulfilment_remainder_cases` `opened` fact is recorded. The Board then
shows `fulfilment_remainder_unresolved=true` and the next action
`Mở Sale để quyết định phần còn lại.`. A decision clears the unresolved filter;
`commercial_correction` keeps the row's commercial action visible and
`cancel_remainder` does not create a delivery or money effect.
Similarly, `unallocatedPayment=true` exposes the exact
`unallocatedPaymentAmount` derived from active Payment, reversal and allocation
facts. It appears in the dedicated `unallocated_payment` filter and its next
action is `Mở khoản thanh toán để phân bổ hoặc ghi nhận tín dụng.`; it is never reported as a missing
customer payment or silently converted into a ledger adjustment.

The V1 operational exception catalog is deliberately bounded. The seven conditions
below are unresolved exceptions derived from canonical facts. `outstanding_delivery`
is the source-backed delivery work condition and `incomplete_receiving` is the
source-backed Purchase receiving condition. `overdue_receivable` is emitted from
the canonical Sale due date and overdue financial state; awaiting payment remains
useful server-authored workflow state, not an exception.
Realtime freshness and close readiness are separate workspace control exceptions,
not synthetic Board rows. `stale_realtime` is client-authored from the connection
state and durable-feed reconciliation; `operational_close_blocked` is returned by
`operations.closeReadiness.controlException` whenever readiness is `blocked`.
Both carry source facts, explanation, next action and resolution condition.

| Exception                         | Source facts and detection                                                                                   | Operator explanation and approved resolution options                                            | Resolution condition                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `outstanding_delivery`            | Sale physical state is `needs_delivery` or `in_delivery`, without returned fulfilment or an opened remainder | Create the remaining Delivery or finish the active Delivery                                     | Remaining Sale quantity is delivered or Sale is validly removed                      |
| `incomplete_receiving`            | Purchase physical state is `needs_receiving`                                                                 | Record the missing Receipt or complete its inspection                                           | Valid received quantity reaches the Purchase quantity                                |
| `unallocated_payment`             | Active Payment minus reversal and effective allocation is greater than zero                                  | Money was received but attribution is unknown; allocate to Sale or retain as customer credit    | Allocation, reversal or explicit customer-credit fact reaches zero unresolved amount |
| `overdue_receivable`              | Posted Sale is unpaid, has a due date before the read clock, and has no unallocated customer payment         | Open the Sale and record the collection action or payment                                       | Overdue receivable balance reaches zero or an allowed fact resolves it               |
| `fulfilment_remainder_unresolved` | An explicit remainder-decision source fact; `needs_delivery`/`in_delivery` alone is insufficient             | Delivery, commercial correction, cancellation or a new Sale must be chosen                      | Append-only fulfilment or commercial decision                                        |
| `return_settlement_unresolved`    | Canonical Delivery Return exists without a settlement fact                                                   | Record the return consequence; V1 supports only `goods_only` with no money effect               | Append-only return settlement fact                                                   |
| `reconciliation_variance`         | Canonical comparison or integrity source reports a mismatch                                                  | Wait for approved reconciliation/correction policy; raw observation does not clear the mismatch | V1 policy-blocked; retain until an approved correction command exists                |

Every `row.exceptions` item carries `sourceFacts`, `unknown`,
`resolutionOptions`, `nextAction` (including the nullable source-specific `href`)
and `resolutionCondition`. The Board exposes that href as the next-step link when
present and explicitly shows when the contract supplies no destination; the
browser never derives a route from an exception kind or label. `counts.exceptionCounts`
uses the same seven keys. PostgreSQL page rows, filters and counts must remain
workspace-scoped and parity-compatible with the shared deriver; the browser does
not infer an exception outside the server-owned source condition. A close read may classify these
conditions as blocking, acknowledgeable or informational, but an acknowledgement
is not a balance, inventory or fulfilment mutation.

`operations.closeReadiness` is the server-authored close gate read. It derives
the Vietnam business period from the workspace operational profile unless an
explicit business date is supplied for historical review. It returns `ready` or
`blocked` with stable blockers for missing/invalid policy, missing measurable
observation kinds in the period, an already closed revision, a blocking exception,
or an unacknowledged acknowledgeable exception. A blocked read also carries the
source-backed `operational_close_blocked` control exception. Each exception summary includes
`acknowledgedCount`; the `acknowledgements` list contains the source-linked,
append-only facts for that business date. An acknowledgement is evidence that
the operator reviewed an unresolved condition, not a resolution: the Board row,
source facts and canonical projections remain unchanged. It includes the policy
version, period, available/missing kinds and current close revision. It does not
calculate a variance or choose observations for `RecordOperationalClose`; that
command remains authoritative.

## Read performance rules

List pages fetch the facts needed to render a row without per-row browser
round-trips. PostgreSQL joins/aggregates and bounded repository queries are the
place for source-backed row state; the client must not issue an N+1 fan-out to
reconstruct debt, fulfilment or stock identity.

Cursor/index implementation details are intentionally kept in repository tests and
performance evidence rather than copied exhaustively here. If a query's ordering
or filtering changes, its database index/evidence must change with it.

## Reconciliation and integrity

Customer account, supplier account and inventory reconciliation compare canonical
append-only sources with rebuildable projections. A healthy projection may be
rebuilt through an authorized command; missing/duplicate/corrupt canonical source
facts are surfaced as integrity failure rather than "fixed" by a projection write.
Workspace integrity and backup validation follow the same fail-closed principle.

## Related

- [command-contracts.md](command-contracts.md)
- [capabilities.md](capabilities.md)
- [ui-state-catalog.md](ui-state-catalog.md)
- [../04-business-rules/read-rules.md](../04-business-rules/read-rules.md)
- [../04-business-rules/authorization-rules.md](../04-business-rules/authorization-rules.md)

## Workspace operational-profile read

`session.operationalProfile` returns the workspace's complete versioned operating
policy. Clients must not infer workflow availability from navigation, role or the
presence of historical records.

## Cashbook reads

The `cash` router exposes:

- `cash.searchAccounts` and `cash.getAccount` — CashAccount plus current rebuildable
  CashBalance;
- `cash.timeline` — cursor-paged canonical CashMovement facts;
- `cash.getExpense` and `cash.getTransfer` — immutable source facts with optional
  append-only reversal;
- `cash.reconciliation` — `consistent | inconsistent | not_found |
integrity_failure`, including projected/canonical balances and diagnostics.

Operational reports add `cash_balances`, `cash_movement_report` and
`expense_report`. Date-filtered cash reports use `transactionTime` and the
workspace's configured Vietnam business-day boundary.

## Inspected-intake reads

The `intake` router exposes:

- `searchIssueCodes` — paged active/inactive condition and defect master data;
- `listArrivals` and `getArrival` — physical arrivals with line, weighing and reversal evidence;
- `getInspection` and `getDisposition` — one immutable quality fact with optional reversal;
- `dispositionSourceSummary` — source, inspected, allocated, remaining and eligible quantities;
- `arrivalLineHistory` — ordered inspections plus every direct or quarantine-child disposition
  rooted at one arrival line.

The line-history read model is the correction surface: clients show active/reversed facts and
reverse downstream facts before upstream facts. It is not an inventory projection.

## Source-linked cost observations

`evidence.getCostObservation` and `evidence.listCostObservations` return exact
source-linked observations. They expose the observed wording, optional exact
money/quantity facts, source references and correction link without deriving COGS,
profit, payable, receivable or inventory.

`evidence.getReconciliationObservation` and
`evidence.listReconciliationObservations` return separate expected/observed
money/quantity facts, item count, scope reference, source references and
correction link. They do not return a derived variance or close status and do not
reconstruct cash, debt, payable or inventory.

`evidence.getDebtObservation` and `evidence.listDebtObservations` return
source-linked payment-term, due-date, promise-to-pay and collection facts. They
do not derive overdue state, allocate payment, or reconstruct a ledger balance.

`evidence.getSupplyCommitmentObservation` and
`evidence.listSupplyCommitmentObservations` return source-linked promised and
minimum quantities, expected arrival, counterparty wording and correction links.
They do not derive purchase commitments, payable, inventory, reorder or supplier
performance.

`evidence.getSupplierObservation` and `evidence.listSupplierObservations` return
source-linked relationship and performance facts. They do not derive supplier
scores, rankings, payable, inventory or recommendations.

`evidence.getDemandObservation` and `evidence.listDemandObservations` return
source-linked customer demand facts. They do not derive Sale state, receivable,
forecast, shortage or reorder meaning.

## Workspace policy reads

`policy.get` and `policy.list` return workspace-scoped versioned policy records.
`policy.availability` returns every supported policy capability with an explicit
`available` or `unavailable` state and reason for a supplied `asOf` time. Missing,
future, expired or retired policy is unavailable; clients must not turn it into a
zero, default, recommendation or derived financial/goods result.
