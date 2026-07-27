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

### M8 — Sale Correction UI (now)

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

### M9 — Payment & account operations (next)

Bring existing Money Truth workflows out of shell-only operation:

- record and reverse payment under current rules;
- opening balance, write-off, dispute settlement, and manual debt adjustment;
- account timeline and balance reconciliation.

Every adjustment requires operation type, reason, actor, and audit. It must not
be a hidden way to correct a Sale.

### M10 — Financial reconciliation (then)

Provide the answer to: **Why is this customer's balance X?**

- current balance, complete entry count and timeline;
- source transaction links;
- projection-versus-ledger consistency and missing/duplicate-source detection;
- privileged projection rebuild and evidence export.

**Horizon 1 gate:** a depot can sell, take payment, correct mistakes, and explain
customer debt without a developer.

## Later horizons — direction, not an implementation plan

| Horizon                               | Milestones                                                                                               | Gate                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 2 — self-service and field resilience | M11 workspace/members/roles; M12 customer operations; M13 offline Quick Sale; M14 reliability/operations | Onboard, authorize, operate on weak networks, back up and recover without a developer. |
| 3 — goods and inputs                  | M15 product catalog; M16 supplier account; M17 purchase; M18 receiving/inventory movement ledger         | Money and goods flows are both traceable.                                              |
| 4 — depot operations                  | M19 delivery; M20 documents/sharing; M21 reports; M22 performance/security/scale                         | Operational views drill down to reliable sources.                                      |
| 5 — intelligence                      | assisted capture, matching, recommendations, forecasting                                                 | Vocabulary, catalog, deterministic workflows, policy and corpus are mature.            |

The later horizons intentionally do not authorize work now. Re-evaluate their
dependencies after M10.

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
