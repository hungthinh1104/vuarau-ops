# ADR-0001 — Modular monolith before microservices

**Status:** accepted · 2026-07-26

## Context

vuarau-ops serves individual wholesale depots. A large depot has perhaps a dozen
concurrent users. The domain boundaries — customer, sale, payment, customer account — are
understood in outline but not proven; the payment/debt boundary in particular has
already shifted once during this bootstrap.

There is no operations team. The people maintaining this are the people building
it.

## Decision

One deployable backend (`apps/api`) containing four modules with enforced internal
boundaries:

- modules own their tables and never read each other's directly;
- `domain-kernel` has no framework dependencies at all;
- the dependency direction is checked mechanically by `scripts/boundary-check.ts`.

Workspace isolation is enforced in the application layer: every repository method
takes `workspaceId` as a required argument.

## Alternatives considered

| Alternative                               | Why not                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Microservices per module                  | Distributed transactions across sale → ledger, for a dozen users. The atomicity BR-COMMAND-005 requires would become a saga, and the first bug would be an account entry without its sale.                                                                                       |
| Serverless functions                      | Connection pooling and cold starts against Postgres, for no scaling need that exists.                                                                                                                                                                                            |
| A single unstructured application         | The boundaries are the point. Without them the ledger becomes writable from anywhere and BR-ACCOUNT-002 is unenforceable.                                                                                                                                                        |
| Postgres row-level security for isolation | Genuinely appealing and probably right eventually. Deferred (ASM-009) because it requires the connection to carry an authenticated role, and Supabase auth is not wired up yet. The application-layer check ships now and RLS becomes defence in depth later, not a replacement. |

## Consequences

**Good.** One transaction spans an sale posting and its ledger entry. One
deploy, one log stream, one database to back up. Module boundaries can be moved
with a refactor rather than a migration plan.

**Bad.** A runaway query can affect every module. Scaling is vertical until it is
not. Boundary enforcement depends on a custom script that a determined developer
can ignore.

**Neutral.** Modules are structured so that extracting one later means replacing
in-process calls with network calls — not untangling shared tables.

## Revisit when

- A single module needs independent scaling or an independent deploy cadence.
- Separate teams own separate modules and release friction is real.
- A tenant requires physical data isolation that a shared database cannot give.

None of these are foreseeable at the current size. Revisiting earlier than that
would be adopting the cost without the problem.
