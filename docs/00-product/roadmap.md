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
Sale snapshot integration are implemented. This does not authorize supplier,
purchase, inventory, pricing or unit conversion work.

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
per-line movements, per-Product/unit projections, adjustments and reconciliation
are implemented. Inbound Goods Truth is proven; outbound Sale fulfilment remains
the explicit M19 boundary.

| Horizon                               | Milestones                                                                       | Gate                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 2 — self-service and field resilience | M11–M14 technically complete                                                     | Onboard, authorize, operate on weak networks, back up and recover without a developer. |
| 3 — goods and inputs                  | M15–M18 technically complete                                                     | Supplier money and inbound goods flows are source-traceable.                           |
| 4 — depot operations                  | M19 delivery; M20 documents/sharing; M21 reports; M22 performance/security/scale | Operational views drill down to reliable sources.                                      |
| 5 — intelligence                      | assisted capture, matching, recommendations, forecasting                         | Vocabulary, catalog, deterministic workflows, policy and corpus are mature.            |

The explicit Goods Truth batch closes M16–M18 with technical evidence. M19
delivery/outbound fulfilment is the next unstarted scope and is not authorized by
this batch.

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
