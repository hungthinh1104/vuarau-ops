# ADR-0028 — Versioned workspace policy registry remains inactive until evidence-backed activation

**Status:** accepted and implemented as infrastructure · 2026-08-03

## Context

Field research covers production depots, wholesale markets, regional hubs and
contract chains with materially different hours, channels, custody, packing,
recognition and planning practices. A single global “fresh-produce depot” policy
would turn one observed workflow into false product truth.

The system nevertheless needs a durable place to record which policy a workspace
is evaluating, who approved it, what evidence supports it and when it is
effective. Without that boundary, future metrics tend to smuggle defaults into
ledger, inventory or dashboard code.

## Decision

Add a workspace-scoped `workspace_policies` registry with explicit kind, version,
state, effective range, definition, evidence references, actor, reason and audit
metadata. The lifecycle is:

```text
draft → approved → retired
```

Only a version approved by the read's knowledge cutoff and inside its business
effective window is reported as available. A new calculation resolves against
decision time and never selects a retired version; historical lineage may still
load an approved or retired version to reproduce or correct an existing result.
Retirement may also close the business interval explicitly for a successor.
Overlapping active windows are rejected during approval. Missing, future, expired
or retired policy is unavailable for new decisions. V1–V16 backups restore
with no policy rows; Backup V17 carries the registry, commercial supply commitments,
supplier observations and customer demand observations.

The registry is not a generic rule engine. Definitions are stored in typed
infrastructure envelopes, and each bounded-context adapter opts in through its
policy-specific schema and effect contract. Valuation, planning,
supplier-performance and management reads use decision-time resolution; no
consumer reads an arbitrary or unsupported definition as a default.

## Consequences

**Good:** workspace variation is explicit, evidence-linked and reproducible;
policy-sensitive metrics can fail closed; future activation has a clear review and
recovery boundary.

**Cost:** storing or approving a policy does not make the related business result
available. Each policy-backed outcome needs a separate vertical slice and field
acceptance.

**Not solved:** the registry does not choose receivable/payable recognition,
COGS/profit, aging, reorder, supplier score, cash forecast, walk-in semantics,
universal shifts or AI recommendations. Inventory valuation beyond the scoped
read-only adapter, including broader cost effects, remains unresolved.

## Alternatives considered

| Alternative                                      | Why rejected                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| One global policy for every depot                | Field evidence shows different channels, hours, custody and recognition moments. |
| Generic key/value rule engine                    | It would make unknown definitions executable without a typed effect contract.    |
| Store policy only in documentation               | The API, audit and backup would have no reproducible workspace-scoped state.     |
| Activate every approved registry row immediately | Approval records readiness; each outcome still needs an adapter and field gate.  |

## Revisit when

Revisit when a policy-backed vertical slice has an approved typed definition,
canonical effect, correction path, read model, PostgreSQL/recovery evidence and
field acceptance, or when one policy kind needs an effective-dated transition
model beyond this registry lifecycle.

## Related

- [workspace policy rules](../04-business-rules/workspace-policy-rules.md)
- [UC-POLICY-001](../02-use-cases/UC-POLICY-001-manage-workspace-policy-version.md)
- [ADR-0027](ADR-0027-configurable-fresh-produce-operating-model.md)
