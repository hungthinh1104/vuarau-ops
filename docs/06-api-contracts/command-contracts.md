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

| Namespace    | Commands                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `session`    | `revokeMembership`, `addMember`, `changeMemberRole`, `reactivateMember`                                              |
| `customer`   | `create`, `update`, `deactivate`, `reactivate`                                                                       |
| `account`    | `rebuildProjection`                                                                                                  |
| `debt`       | `adjust`                                                                                                             |
| `sale`       | `createDraft`, `updateDraft`, `discardDraft`, `post`, `void`                                                         |
| `payment`    | `record`, `reverse`                                                                                                  |
| `product`    | `create`, `update`, `deactivate`, `reactivate`                                                                       |
| `quality`    | `create`, `update`, `deactivate`, `reactivate`                                                                       |
| `supplier`   | `create`, `update`, `deactivate`, `reactivate`, `recordPayment`, `reversePayment`, `adjustAccount`, `rebuildAccount` |
| `purchase`   | `createDraft`, `updateDraft`, `discardDraft`, `confirm`, `void`                                                      |
| `receiving`  | `record`, `reverse`                                                                                                  |
| `inventory`  | `adjust`, `reclassify`, `rebuild`                                                                                    |
| `delivery`   | `createDraft`, `updateDraft`, `cancelDraft`, `dispatch`, `markDelivered`, `recordReturn`                             |
| `document`   | `generate`, `share`, `revokeShare`                                                                                   |
| `operations` | `exportBackup`, `restoreBackup`                                                                                      |

The router source is authoritative for procedure names. Domain-contract modules are
authoritative for payload and result shapes.

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

This is the implemented grade boundary, not a claim that full quality inspection,
defect capture, supplier claims or quarantine exist.

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
