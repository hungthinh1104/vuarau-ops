# ADR-0002 — Command-based writes instead of generic CRUD

**Status:** accepted · 2026-07-26

## Context

The obvious API for a sale with a status is `PATCH /sales/:id { status }`. It
is also how a depot ends up with a sale posted twice, a payment marked
reversed with no compensating ledger entry, and a debt balance nobody can explain.

Three properties this system needs are impossible to attach to a generic update:

1. **Idempotency.** A retry token belongs to an _intent_, not to a field.
2. **Auditability.** "Who posted this sale and why" cannot be reconstructed
   from "someone set `status` to `posted`".
3. **Effects.** Posting a sale must append an account entry. A field setter has
   nowhere to put that requirement, so it ends up in a trigger, a hook, or nowhere.

## Decision

Every write is a named business command carrying a fixed envelope: `commandId`,
`idempotencyKey`, `expectedVersion?`, `workspaceId`, `actorId`, `occurredAt`,
`payload`.

Seven commands exist. `updateEntity`, `updateSaleStatus`, `patchCustomerDebt`, and
`setPaymentStatus` do not exist and are not to be added.

Lifecycle values are never arguments. `PostSale` takes no status — the
transition _is_ the command.

## Alternatives considered

| Alternative                              | Why not                                                                                                                                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REST CRUD with PATCH                     | See context. The bugs it enables are exactly the P0 ones.                                                                                                                                                             |
| CRUD plus a service layer that validates | The generic endpoint remains reachable, and the validation is a guard around an operation that should not be expressible.                                                                                             |
| Full CQRS with an event store            | Real benefits, large cost. The customer account ledger already gives an append-only audit trail where it matters; making _everything_ event-sourced buys replay for master data nobody needs to replay. See ADR-0004. |
| GraphQL mutations                        | A naming convention, not a mechanism. The envelope discipline would still have to be added, and nothing would enforce it.                                                                                             |

## Consequences

**Good.** Every write has a name that matches something a depot owner would say.
Idempotency, audit, and concurrency are handled once, in one pipeline, for all six
commands. The set of possible state changes is enumerable — that is what makes
[the transition catalog](../03-state-machines/transition-catalog.md) checkable.

**Bad.** More types than a CRUD API. A new business action means a new command, a
new rule entry, and new tests — deliberate friction, but friction.

**Neutral.** Reads stay plain queries. This is not CQRS; only the write side is
command-shaped.

## Revisit when

- A genuine bulk-edit need appears (e.g. correcting 500 mis-imported customers).
  Even then the answer is likely a bulk _command_, not a generic update.
- Never for "it would be faster to just add a PATCH".
