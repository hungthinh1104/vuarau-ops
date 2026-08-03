# Command contracts

The executable command schemas live in `packages/domain-contracts/src/*/index.ts`.
The authenticated tRPC surface is composed in
`apps/api/src/infrastructure/trpc/router.ts`; handlers run through the shared
command pipeline. This document records the stable cross-command rules and the
current bounded-context surface. Payload field definitions belong to the schemas,
not duplicated prose.

## Command envelope

Every state-changing business command carries the same envelope:

```ts
{
  commandId: string;
  idempotencyKey: string;
  expectedVersion?: number;
  workspaceId: string;
  actorId: string;
  occurredAt: string;
  payload: { /* command-specific schema */ };
}
```

`actorId` is checked against the verified bearer-token principal, never trusted as
identity. `workspaceId` is an authorization boundary. `occurredAt` is business
time and is distinct from server recording time. `expectedVersion` is present on
commands that protect a mutable aggregate from lost updates; commands whose
correct concurrency rule is a row lock or append-only uniqueness do not gain a
version merely for uniformity.

Creation identifiers are supplied by the client where retry/offline identity must
remain stable. Replaying an identical command with the same idempotency key returns
the original committed result; reusing an identity for different intent is
rejected.

See [authorization-rules.md](../04-business-rules/authorization-rules.md) for the
current permission matrix and [error-contract.md](error-contract.md) for stable
rejection codes.

## Current command surface

The table is a navigation catalog, not a second payload specification. When a
command changes, update its schema and tests first, then keep this catalog aligned.

| Namespace       | Commands                                                                                                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session`       | `revokeMembership`, `addMember`, `changeMemberRole`, `updateOperationalProfile`, `reactivateMember`                                                                                                       |
| `customer`      | `create`, `update`, `deactivate`, `reactivate`                                                                                                                                                            |
| `account`       | `rebuildProjection`                                                                                                                                                                                       |
| `debt`          | `adjust`                                                                                                                                                                                                  |
| `sale`          | `createDraft`, `updateDraft`, `discardDraft`, `post`, `void`                                                                                                                                              |
| `customerOrder` | `createDraft`, `updateDraft`, `confirm`, `cancel`                                                                                                                                                         |
| `payment`       | `record`, `reverse`                                                                                                                                                                                       |
| `product`       | `create`, `update`, `deactivate`, `reactivate`                                                                                                                                                            |
| `quality`       | `create`, `update`, `deactivate`, `reactivate`                                                                                                                                                            |
| `supplier`      | `create`, `update`, `deactivate`, `reactivate`, `recordPayment`, `reversePayment`, `adjustAccount`, `rebuildAccount`                                                                                      |
| `purchase`      | `createDraft`, `updateDraft`, `discardDraft`, `confirm`, `void`                                                                                                                                           |
| `receiving`     | `record`, `reverse`                                                                                                                                                                                       |
| `inventory`     | `adjust`, `reclassify`, `rebuild`                                                                                                                                                                         |
| `delivery`      | `createDraft`, `updateDraft`, `cancelDraft`, `dispatch`, `markDelivered`, `recordReturn`                                                                                                                  |
| `document`      | `generate`, `share`, `revokeShare`                                                                                                                                                                        |
| `operations`    | `exportBackup`, `restoreBackup`                                                                                                                                                                           |
| `cash`          | `createAccount`, `updateAccount`, `deactivateAccount`, `reactivateAccount`, `recordExpense`, `reverseExpense`, `transfer`, `reverseTransfer`, `adjust`, `rebuild`                                         |
| `intake`        | `createIssueCode`, `updateIssueCode`, `deactivateIssueCode`, `reactivateIssueCode`, `recordArrival`, `reverseArrival`, `recordInspection`, `reverseInspection`, `recordDisposition`, `reverseDisposition` |
| `pricing`       | `record`                                                                                                                                                                                                  |
| `evidence`      | `recordCostObservation`, `recordReconciliationObservation`, `recordDebtObservation`, `recordSupplyCommitmentObservation`, `recordSupplierObservation`, `recordDemandObservation`                          |
| `policy`        | `createDraft`, `approve`, `retire`                                                                                                                                                                        |

The router source is authoritative for procedure names. Domain-contract modules are
authoritative for payload and result shapes.

`policy.createDraft`, `policy.approve` and `policy.retire` manage the inactive
workspace policy registry. Approval requires evidence references and a reason;
storing or approving a definition does not activate a debt, inventory, cost,
planning, supplier or management policy. Future policy adapters must own their
typed effect contract separately.

Supplier payment and reversal payloads accept `evidenceReferences`. The supplier
payment detail read returns the payment references and append-only reversal references;
they are source-linked metadata only and do not recognize payable or imply goods movement.

Sale draft creation/update and Sale void payloads, plus Purchase draft
creation/update and Purchase void payloads, also accept `evidenceReferences`. The
Sale/Purchase reads return these source links, including the adjacent void record
when one exists. They preserve links to field packets, photos, messages or paper
documents only; they do not recognize receivable/payable, inventory or correction
effects. A correction still uses the canonical void/compensation command.

Cash expense, expense-reversal, transfer, transfer-reversal and adjustment payloads
also accept `evidenceReferences`. Expense and transfer detail reads return the source
references and their reversal references; adjustment references are persisted with the
append-only adjustment source. These links are attribution metadata only and do not
create, allocate or reinterpret a cash effect.

## Cross-context effect boundaries

Commands are named for the business event whose consequences they own. A command
must not borrow the meaning of a neighbouring context.

| Command/event                            | Commercial / account effect                                         | Physical effect                                          |
| ---------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| `sale.post`                              | freezes the Sale and creates the configured customer-account effect | none                                                     |
| `sale.void`                              | appends the Sale compensation                                       | none                                                     |
| `payment.record` / `payment.reverse`     | changes customer account only                                       | none                                                     |
| `purchase.confirm` / `purchase.void`     | changes supplier account according to current policy                | none                                                     |
| `receiving.record` / `receiving.reverse` | none                                                                | appends inbound/inverse movements                        |
| `inventory.adjust`                       | none                                                                | explicit attributable quantity adjustment                |
| `inventory.reclassify`                   | none                                                                | equal source-grade decrease + destination-grade increase |
| `delivery.dispatch`                      | none                                                                | appends outbound movements                               |
| `delivery.recordReturn`                  | none                                                                | appends compensating inbound movements                   |
| `delivery.markDelivered`                 | none                                                                | acknowledgement only; dispatch already moved stock       |

The recognition moments for Sale and Purchase are technically implemented but
remain subject to the owner-validation gates recorded in the decision backlog.

### Posted Sale fulfilment identity

A draft line may be unresolved while a worker is typing. `sale.post` validates the
stored draft against current server truth before its financial effect: every line
must reference an active workspace Product and an active workspace QualityGrade,
with the immutable snapshots remaining human-readable history. Delivery then
consumes the exact Product/QualityGrade/unit identity; it must never infer Product
identity from display text.

### Quality and inventory commands

QualityGrade is workspace master data for commercial classification. Grade changes
to physical stock use `inventory.reclassify`; they do not rewrite historical
Receipt, Sale, Delivery or inventory facts. Spoilage/loss is an explicit negative
inventory adjustment, not a Sale or Receipt.

Inspected intake now keeps condition/defect evidence and quarantine separate from
commercial QualityGrade. Supplier claims/credits and canonical lot/expiry remain
outside the implemented boundary.

## Money and quantity on the wire

```ts
amount:   { amountMinor: 875000, currency: "VND" }
quantity: { valueScaled: 12500, unit: "kg" }
```

Money uses integer minor units. Quantity uses integer scaled units. No transport
float is accepted as canonical transactional truth, and incompatible units are not
silently converted.

## Execution pipeline

Business commands use the shared command pipeline in
`apps/api/src/modules/shared/command-pipeline.ts`. In outline it:

1. validates the published command schema;
2. resolves and verifies authenticated actor/workspace authority;
3. validates business time;
4. coordinates idempotency/duplicate-safe replay;
5. opens one database transaction;
6. loads and locks the required aggregate/source facts;
7. applies optimistic-concurrency checks where the command contract requires them;
8. executes the domain decision;
9. persists the aggregate plus attributable ledger/movement/audit effects;
10. stores the command receipt/result;
11. commits atomically and maps the result DTO.

A failure before commit leaves no partial business effect. Read-side projections
may be rebuilt, but canonical ledger/movement history is never repaired by silent
mutation.

## Public surface exception

The authenticated tRPC router deliberately exports no `publicProcedure`. Public
shared documents are exposed only through the dedicated token-scoped read-only
handler under `/public/documents/<token>`. The token is a capability, only its hash
is stored, and expiry/revocation/digest checks fail closed.

## Related

- [read-models.md](read-models.md)
- [error-contract.md](error-contract.md)
- [capabilities.md](capabilities.md)
- [../04-business-rules/authorization-rules.md](../04-business-rules/authorization-rules.md)
- [../00-product/product-invariants.md](../00-product/product-invariants.md)

## Workspace operational-profile commands

- `session.updateOperationalProfile` replaces the complete versioned workspace
  policy. It is owner-only, requires `expectedVersion` and a reason, and may select
  Purchasing, Inventory, commercial Grade, Delivery, Cashbook, inspected Intake,
  weighing mode and the business-day boundary. The server rejects invalid dependencies
  and disabled-workflow commands.

## Cashbook commands

The `cash` router exposes deterministic command procedures:

- `cash.createAccount`, `cash.updateAccount`, `cash.deactivateAccount`,
  `cash.reactivateAccount`;
- `cash.recordExpense`, `cash.reverseExpense`;
- `cash.transfer`, `cash.reverseTransfer`;
- `cash.adjust`;
- `cash.rebuild`.

Every cash mutation requires `OperationalProfile.cashbookMode=accounts_ledger`.
Canonical source facts and `CashMovement` rows are append-only. Payment and Supplier
Payment remain in their existing routers; when Cashbook is enabled they require a
CashAccount and append the debt/payable and cash effects atomically.

Customer payment and payment-reversal commands may carry `evidenceReferences`.
The server stores and returns these source links with the immutable payment or
reversal fact. They are attribution metadata only: they do not allocate debt,
choose due dates, or create an additional ledger/cash effect.

Delivery draft creation/update and customer-return commands also accept
`evidenceReferences`. Delivery reads return the delivery references and each
return's references. These links preserve loading, handover or return evidence;
they do not create inventory movements, customer credit, refunds or other money
effects. Dispatch and return movement semantics remain owned by the canonical
Delivery commands.

Goods-arrival, quality-disposition and direct purchase-receipt commands also accept
`evidenceReferences`; their reversal commands preserve a separate reference list.
The corresponding reads return these links beside the immutable physical fact.
They are source-linked metadata only: they do not recognize payable, choose a
quality policy, or create an additional inventory movement.

`evidence.recordCostObservation` requires at least one `evidenceReference` and
preserves exact observed money/quantity facts, participant wording and optional
source references. A `correction` creates a new row linked to an earlier
CostObservation. It is a fact-capture command only: it has no ledger, inventory,
COGS or profit effect.

`evidence.recordReconciliationObservation` requires at least one
`evidenceReference` and preserves separate expected/observed money and quantity
facts, optional item count, scope reference and participant wording. It is a
fact-capture command only: it does not calculate variance, close a period, match
a bank statement or change cash, debt, payable or inventory. A `correction`
creates a new row linked to an earlier ReconciliationObservation.
`evidence.recordDebtObservation` requires at least one source reference and
preserves payment-term, due-date, promise-to-pay and collection facts when
present. It does not label a debt overdue, allocate a payment, or append a
ledger/cash row. A correction creates a new row linked to an earlier
DebtObservation.

`evidence.recordSupplyCommitmentObservation` requires at least one source
reference and preserves promised/minimum quantities, optional expected arrival,
counterparty wording and known identity when present. It does not create a
Purchase, payable, receipt, inventory, reorder or supplier-performance effect.

`evidence.recordSupplierObservation` preserves source-linked supplier roles,
responsibilities, source area, lead-time wording, traceability, quantities and
timing. It does not create a supplier score, ranking, payable, inventory,
claim settlement or purchase recommendation.
A correction creates a new row linked to an earlier SupplyCommitmentObservation.

`evidence.recordDemandObservation` preserves source-linked customer/product/grade
identity, requested and minimum quantities, requested time, counterparty wording
and demand reference. It does not create a Sale, receivable, inventory, forecast,
shortage or reorder effect. A correction creates a new immutable row linked to an
earlier DemandObservation.

## Inspected-intake commands

The `intake` router exposes four append-only fact families and explicit corrections:

- issue-code master data: `createIssueCode`, `updateIssueCode`, `deactivateIssueCode`,
  `reactivateIssueCode`;
- physical custody: `recordArrival`, `reverseArrival`;
- quality observation: `recordInspection`, `reverseInspection`;
- responsibility/outcome allocation: `recordDisposition`, `reverseDisposition`.

`recordArrival` is enabled only in `inspected_arrival`; gross/tare/net evidence is
required only in `gross_tare_net`. Only accepted disposition allocations append positive
InventoryMovement rows. Reversal commands remain available after profile changes and
must run child disposition → parent disposition → inspection → arrival.
