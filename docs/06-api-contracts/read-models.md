# Read models

Executable DTO schemas live in `packages/domain-contracts/src/*/index.ts` and the
current authenticated tRPC surface is composed in
`apps/api/src/infrastructure/trpc/router.ts`. PostgreSQL query implementations live
under `packages/db/src/repositories/read/`; application handlers apply the shared
read/authorization pipeline. This document records read-side invariants and the
current procedure catalog without duplicating every DTO field.

## Current read surface

| Namespace    | Reads                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `session`    | `me`, `workspaces`, `workspace`, `operationalProfile`                                                                                 |
| `customer`   | `search`, `get`, `recent`, `duplicates`                                                                                               |
| `account`    | `adjustment`, `balance`, `timeline`, `reconciliation`, `reconciliationEvidence`                                                       |
| `sale`       | `get`, `list`, `captureContext`, `detail`                                                                                             |
| `payment`    | `get`, `list`                                                                                                                         |
| `audit`      | `timeline`                                                                                                                            |
| `product`    | `search`, `get`                                                                                                                       |
| `quality`    | `list`, `get`                                                                                                                         |
| `supplier`   | `search`, `get`, `priceHistory`, `getPayment`, `getAdjustment`, `balance`, `timeline`, `reconciliation`, `evidence`                   |
| `purchase`   | `get`, `list`                                                                                                                         |
| `receiving`  | `get`, `listForPurchase`, `summaryForPurchase`                                                                                        |
| `inventory`  | `balances`, `getAdjustment`, `timeline`, `reconciliation`, `evidence`                                                                 |
| `delivery`   | `get`, `list`, `fulfilment`                                                                                                           |
| `document`   | `get`, `listForSource`                                                                                                                |
| `report`     | `definitions`, `metrics`, `operational`, `csv`                                                                                        |
| `operations` | `integrity`, `validateBackup`                                                                                                         |
| `cash`       | `searchAccounts`, `getAccount`, `timeline`, `getExpense`, `getTransfer`, `reconciliation`                                             |
| `intake`     | `searchIssueCodes`, `getArrival`, `listArrivals`, `getInspection`, `getDisposition`, `dispositionSourceSummary`, `arrivalLineHistory` |
| `pricing`    | `list`, `resolve`                                                                                                                     |
| `evidence`   | `getCostObservation`, `listCostObservations`, `getReconciliationObservation`, `listReconciliationObservations`                        |

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

`sale.captureContext` carries canonical historical `productId` when the historical
line has one. Legacy history with no Product id remains an unresolved suggestion;
display name is never promoted to canonical identity implicitly.

`supplier.priceHistory` is an observed source read over confirmed Purchase-line
snapshots. It preserves Product identity, quantity, unit price, Purchase id and
business/recording timestamps, with optional Product filtering and keyset
pagination. Draft/discarded Purchases are excluded. It is not a normalized price,
margin, recommendation or supplier-performance metric.

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
not claim that COGS, margin, debt aging, reorder risk or supplier-performance
metrics exist. `report.metrics` makes those candidates explicit as
`unavailable`, with their policy gates and next evidence, until their business
policies and source facts are agreed and implemented. Neither read returns a
numeric fallback for an unavailable metric. The contract rejects an `available` or
`degraded` metric unless formula, canonical sources, included/excluded states,
business time, scope, freshness, integrity behavior, drill-down and action are
all present. Web Reports renders the same catalog as a read-only evidence panel;
a catalog read failure is surfaced as a read failure, not as an empty or numeric
metric state.

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
