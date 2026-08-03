# ADR-0027 — Configurable fresh-produce operating model

**Status:** accepted as architecture baseline; incremental implementation · 2026-08-03

## Context

Field samples across production regions, wholesale markets, regional hubs and
contract channels do not describe one universal Vietnamese vegetable-depot
workflow. They differ in operating hours, customer channels, source and packing
requirements, transport responsibility, payment terms, recognition moments,
quality practice and close routines.

Treating one observed pattern as the product model would make the software record
facts that did not happen, or infer financial effects from a physical event that
was only an observation.

## Decision

The product baseline is a **configurable fresh-produce depot and distribution
operating system** with two explicit layers:

1. **Universal fact layer:** demand/order, supply commitment, arrival, weighing,
   inspection, disposition, grade, packing, allocation, load, dispatch, delivery,
   payment, return, claim, cost observation and reconciliation observation.
2. **Workspace policy layer:** recognition, quality, packing, pricing, cost, debt,
   planning, approval, reconciliation and traceability policies.

The layers are connected only by explicit, authorized commands. A fact may be
captured without creating a balance or inventory movement. When policy permits a
cross-dimension effect, that effect has one canonical implementation and one
reconciliation path.

The operating cycle is configurable. Workspace policy may use an operating-day
boundary, sessions, packing/shipment batches, trips or an owner-selected
reconciliation period. The system must not globally assume night/morning, 00:00,
05:00, one close per day or one customer channel.

Product identity may include Product, Quality/Grade, Unit, Source and Packing
specification. The latter two remain optional for workspaces that do not use them,
but are first-class when the configured workflow requires them.

## Policy boundary

Raw evidence capture is a safe next implementation surface. COGS/profit, aging,
reorder recommendations, supplier scoring and AI advice remain unavailable until
ASM-039–048 are answered with field evidence and recorded policy. Capturing a
promised quantity or a rejected quantity must not be described as a reorder risk,
overdue debt or supplier score.

## Consequences

**Good:** the model can serve materially different fresh-produce operations while
keeping goods truth, commercial truth and financial truth explainable. New facts
can be added without changing the meaning of existing Purchase, Arrival, ledger or
Delivery records.

**Cost:** each new cross-dimension effect needs a contract, policy decision,
authorization, correction, reconciliation, backup/restore coverage and real-stack
evidence. The repository cannot close management metrics from code alone.

## Alternatives considered

| Alternative                                    | Why rejected                                                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| One universal depot workflow                   | It forces stages, hours and responsibilities that are absent in other operations.                                    |
| One `ReceiveGoods` command for the whole chain | Arrival, acceptance, grading, packing and financial recognition are different facts with different correction paths. |
| Generic global rule builder                    | It hides policy in configuration that cannot be reviewed as one canonical business rule.                             |
| Immediate COGS, aging or supplier scoring      | The required valuation, terms and performance definitions are not field-validated.                                   |

## Revisit when

Revisit this architecture when a real workspace requires a new fact or policy that
cannot be represented with explicit workspace scope, separate commercial/physical/
financial truth, append-only correction, deterministic authorization, and
backup/reconciliation evidence. Revisit individual policy gates when the field
worksheet records a concrete rule and representative examples, not merely because
the UI would be more convenient with a derived metric.

## Migration rule

Extend the current bounded contexts additively. Do not rename `PostSale`,
`ConfirmPurchase`, `GoodsArrival`, `QualityInspection`, `QualityDisposition` or
`Delivery` to imply a broader meaning. Do not retrofit packing, load, claim or
valuation semantics into an existing command merely to make a journey look
complete. Introduce a new typed fact and its trace when the operational evidence
requires it.

## Related

- [operating model](../01-domain/operating-model.md)
- [ADR-0024 — workspace operational profile](ADR-0024-workspace-operational-profile.md)
- [ADR-0022 — commercial grade and quality evidence](ADR-0022-quality-inspection-and-lot-boundary.md)
- [decision backlog](decision-backlog.md)
- [policy-closure worksheet](policy-closure-worksheet.md)
