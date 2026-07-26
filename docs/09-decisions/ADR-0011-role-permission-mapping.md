# ADR-0011 — A static role→permission table, not a policy engine

**Status:** accepted · 2026-07-26

## Context

Milestone 1 needed to stop every workspace member from being able to move any
customer's balance (ASM-007). That requires a notion of "may this person do this".

The design reference (`design.md`) names five roles — owner, accountant, sales,
warehouse, delivery — and expects a `permission_denied` state on sale entry,
payment recording, and debt adjustment.

The tempting next step is a general mechanism: policies in the database, a rule
DSL, attribute-based conditions. That is also how a system ends up unable to
answer "who can write off a debt?" without running a query.

## Decision

1. Five roles and nine permissions, in one frozen literal in
   `packages/domain-contracts/src/shared/authorization.ts`.
2. Each command declares exactly one required permission at its call site.
3. `roleHasPermission(role, permission)` is the only authorization predicate. The
   guard and the capability shown to the UI both call it.
4. Membership carries the role, so it is per workspace: the same person can be an
   owner of their own depot and nothing in another.
5. Least privilege for the defaults. `debt.adjust` belongs to `owner` and
   `accountant` only; `warehouse` and `delivery` get reads.
6. The table lives in `domain-contracts` — it involves no aggregate state and is a
   shape the API and a future UI must agree on.

## Alternatives considered

| Alternative                                                      | Why not                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Policy engine / rule DSL** (Casbin, OPA, home-grown)           | Lets somebody express a debt-adjustment policy nobody can read off the page. For nine permissions the mechanism would be larger than the policy, and the failure mode — a rule that quietly grants more than intended — is exactly what this milestone exists to prevent. |
| **Permissions stored per membership row**                        | Maximum flexibility, and every depot ends up with a bespoke matrix nobody can audit. Roles are the abstraction the depot already thinks in.                                                                                                                               |
| **Roles checked ad hoc in each handler** (`if role !== "owner"`) | Scatters the policy across six files, and the seventh command forgets. One declared permission per command is checkable by reading the call sites.                                                                                                                        |
| **Roles from the Supabase JWT**                                  | Hands the identity provider control over who can move money. See ADR-0010.                                                                                                                                                                                                |
| **A single `is_admin` boolean**                                  | Cannot express "an accountant may reverse payments but not post sales", which is the actual shape of a depot.                                                                                                                                                             |

## Consequences

**Good.** The entire authorization policy is one screenful, reviewable by someone
who is not a programmer. A new command must name its permission, so forgetting to
authorize it does not compile. Capabilities cannot drift from the guard because
they are the same function.

**Bad.** Anything conditional — "a sales worker may adjust debt under 100.000 ₫",
"only during their own shift" — does not fit and would need this decision
revisited rather than extended. Adding a permission means a code change and a
deploy, not a configuration edit. That is a real cost and an intentional one: a
change to who may move money should go through review.

**Unconfirmed.** The mapping itself is a starting point, not settled policy. Only
`debt.adjust` was specified by the milestone. Whether a delivery driver may record
the cash they collect is a genuine business question, defaulted to _no_ and
recorded as ASM-017.

## Revisit when

- A depot needs conditional or amount-scoped permissions.
- Roles need to be customisable per workspace.
- The permission count outgrows what fits on a screen — at which point the
  problem is the number of permissions, not the table.
