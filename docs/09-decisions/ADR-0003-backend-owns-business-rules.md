# ADR-0003 — The backend owns business rules

**Status:** accepted · 2026-07-26

## Context

The product will have a web client and a mobile client, both offline-tolerant.
Both need to know whether a confirm button should be enabled. The tempting answer
is to implement "an order needs at least one line" on the client for responsiveness
and again on the server for safety.

Two copies of a money rule drift. The client's copy ships on a phone that updates
when the user feels like it.

## Decision

1. All business rules live in `packages/domain-kernel` as pure functions and are
   evaluated by the server on every command, from state the server loaded itself,
   inside the transaction.
2. Clients never decide whether an operation is legal. They **ask**, via
   [capabilities](../06-api-contracts/capabilities.md) attached to DTOs.
3. Capabilities are computed by the _same_ functions the command handlers use —
   `canConfirmOrder` is called by both the query and the command. One
   implementation, no second copy to drift.
4. `domain-kernel` may not import tRPC, Drizzle, Next.js, React, HTTP, or browser
   APIs. Enforced by `scripts/boundary-check.ts`.
5. Decision functions are deterministic: no clock, no UUID generation, no I/O. Time
   arrives as `occurredAt`; ids arrive in the payload; `recordedAt` is stamped by
   the application layer afterwards.

## Alternatives considered

| Alternative                                              | Why not                                                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared validation library used by both client and server | Better than two copies, but a shipped client runs an old version of it against a new server. The version skew _is_ the drift.                                 |
| Client-side rules with server-side re-validation         | What we do — except the client's copy is a capability flag computed by the server, not logic.                                                                 |
| Trust the client, validate at the database               | Constraints catch shape, not policy. A database cannot express "a reversal may not exceed the remaining reversible amount" without becoming the domain layer. |

## Consequences

**Good.** One place to change a rule. Clients cannot invent policy. Pure functions
make P0 rules testable without a database, a clock, or a mock — the ten required
tests run in milliseconds.

**Bad.** Every capability the UI wants must be added to a DTO server-side; the
client cannot compute a new one locally. Purity has a cost: ids and timestamps must
be threaded in from outside rather than generated where they are needed.

**Neutral.** Clients still validate _shape_ — required fields, number formats — for
immediate feedback. That is UX, not policy, and the server re-validates it anyway.

## Revisit when

- A rule genuinely needs to run offline before the server has ever seen the data.
  Even then the answer is to ship the kernel to the client (it is
  dependency-free by design), not to write a second implementation.
