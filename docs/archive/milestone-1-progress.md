# Milestone 1 — Trusted identity and authorization

Closes the largest hole left by the bootstrap: `actorId` was self-asserted and any
workspace member could move any customer's debt (ASM-007).

---

## Inspection — what exists today

| Concern                   | Current state                                                                                                                                                                    | Verdict            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Authentication            | **None.** `apps/api/src/infrastructure/trpc/context.ts` accepts an optional `authenticatedActorId` from its caller; nothing verifies a token.                                    | Replace            |
| Impersonation guard       | `commandProcedure` in `trpc.ts` compares the envelope's `actorId` to `ctx.authenticatedActorId` — but **only when one was supplied**, so it is a no-op in every real deployment. | Replace            |
| Authorization             | `command-pipeline.ts` step 4 calls `repos.workspaces.isMember(...)` — a boolean. Membership is all-or-nothing.                                                                   | Extend             |
| Roles                     | Not modelled. `workspace_memberships` has `is_active` and nothing else.                                                                                                          | Add                |
| Permissions               | Do not exist.                                                                                                                                                                    | Add                |
| Queries                   | `debt.queries.ts` takes `workspaceId` as a plain argument with **no authorization at all** — any caller can read any workspace's ledger.                                         | **P0 hole; fix**   |
| Rejection codes           | `WORKSPACE_ACCESS_DENIED` is the only authorization code.                                                                                                                        | Extend             |
| Capabilities              | Order and payment only, computed from aggregate state in the kernel.                                                                                                             | Add debt           |
| `is_active` on membership | Read by the Drizzle repository (`eq(isActive, true)`), **ignored** by the in-memory one.                                                                                         | Fix the divergence |

Two findings worth calling out before any code changes:

1. **Queries are unauthenticated.** `caller.debt.ledger({ workspaceId, customerId })`
   returns another depot's debt book today. The bootstrap's workspace isolation was
   enforced on the write path only. This is a P0 leak and is in scope.
2. **The in-memory and Drizzle membership implementations disagree** about
   `is_active`. The application tests could not have caught an inactive-membership
   bug. Both get the same semantics here, and a test pins it.

---

## File-level plan

### `packages/domain-contracts`

| File                                    | Change                                                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/authorization.ts` **(new)** | `WORKSPACE_ROLES`, `PERMISSIONS`, `ROLE_PERMISSIONS` table, `roleHasPermission()`, `workspaceRoleSchema`, `permissionSchema`                                 |
| `src/shared/rejection-codes.ts`         | + `AUTHENTICATION_REQUIRED`, `AUTHENTICATION_INVALID`, `ACTOR_NOT_FOUND`, `ACTOR_IMPERSONATION_DENIED`, `WORKSPACE_MEMBERSHIP_INACTIVE`, `PERMISSION_DENIED` |
| `src/debt/index.ts`                     | + `debtCapabilitiesSchema`; `customerDebtSummaryDtoSchema` gains `capabilities`                                                                              |
| `src/shared/index.ts`                   | export the new module                                                                                                                                        |

The role→permission table lives in **contracts**, not the kernel: it is a shape
both the API and a future UI must agree on, and it involves no aggregate state.

### `packages/db`

| File                                            | Change                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/schema/enums.ts`                           | + `workspaceRoleEnum`                                                                               |
| `src/schema/workspace.ts`                       | `actors.supabaseUserId` (nullable, unique); `workspaceMemberships.role` (not null, default `owner`) |
| `migrations/0002_workspace_roles.sql` **(new)** | generated + hand-checked; see risks below                                                           |
| `src/repositories/index.ts`                     | `workspaces.isMember` → `findMembership`; + `actors.findBySupabaseUserId`                           |
| `src/seeds/seed.ts`                             | seed one actor per role, each with a `supabase_user_id`                                             |
| `src/testing/db-test-context.ts`                | seed actors per role; expose their ids                                                              |

### `apps/api`

| File                                                | Change                                                                            |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/infrastructure/auth/jwt-verifier.ts` **(new)** | `JwtVerifier` port + `createSupabaseJwtVerifier` (HS256 secret or JWKS)           |
| `src/infrastructure/auth/principal.ts` **(new)**    | `AuthenticatedPrincipal`; `resolvePrincipal(deps, verifier, token)`               |
| `src/infrastructure/persistence/ports.ts`           | `WorkspaceRepository.findMembership`; + `ActorRepository`                         |
| `src/infrastructure/persistence/in-memory/…`        | mirror both, **including `isActive`**                                             |
| `src/infrastructure/trpc/context.ts`                | build a `CommandContext` per request from the `Authorization` header              |
| `src/infrastructure/trpc/trpc.ts`                   | `commandProcedure` requires a principal; + transport codes                        |
| `src/infrastructure/trpc/router.ts`                 | pass the per-request context; queries authorized too                              |
| `src/modules/shared/command-pipeline.ts`            | step 4 becomes identity → membership → active → permission                        |
| `src/modules/shared/authorization.ts` **(new)**     | `authorizeWorkspaceAccess()` shared by commands and queries; `debtCapabilities()` |
| `src/modules/*/**.handler.ts` (6)                   | take `CommandContext`; declare `requiredPermission`                               |
| `src/modules/debt/debt.queries.ts`                  | require `debt.read`; return capabilities                                          |
| `src/server.ts`                                     | build the verifier from env                                                       |
| `src/testing/command-test-harness.ts`               | seed roles; build contexts per role                                               |

### `packages/test-fixtures`

Actor ids per role, a fixed Supabase subject per actor, and principal builders.

### `docs/`

`04-business-rules/authorization-rules.md` (BR-AUTH-001…006),
`ADR-0010` (JWT verification at the boundary),
`ADR-0011` (static role→permission table, not a policy engine),
plus updates to the error catalog, capabilities, command contracts, data model,
REPO_MAP, `CLAUDE.md`, the decision backlog, and `trace-map.yml`.

---

## Migration and backward-compatibility risks

### R-1 — `workspace_memberships.role` backfill is over-permissive

`role` is `NOT NULL DEFAULT 'owner'`.

Every existing membership row was created when membership _meant_ unrestricted
access. Backfilling anything narrower would silently revoke access that people
currently have — including, in the worst case, locking a depot out of its own
debt adjustments. Backfilling `owner` preserves today's behaviour exactly.

**The risk is the opposite direction:** after this migration every existing member
is an owner, so the permission system grants everything until somebody downgrades
staff. That is a deliberate trade — no lockout now, a review task next — and it is
recorded as **ASM-018**, not left implicit.

The repository currently has **no production data**, so the practical blast radius
is the local development database and CI.

### R-2 — `actors.supabase_user_id` is nullable

Existing actors have no Supabase user. A nullable column with a unique index means
they keep working for seeds and imports but **cannot authenticate** — there is no
subject that resolves to them. That is correct: an actor with no verified identity
should not be able to issue commands.

Consequence: the seed must set `supabase_user_id`, or `pnpm db:seed` produces
actors nobody can log in as.

### R-3 — Handler signature change is breaking

Every handler moves from `(deps, input)` to `(ctx, input)`. There are no external
consumers yet (no UI), so the blast radius is this repository. Doing it now, while
the only callers are the router and the tests, is far cheaper than after a client
exists.

### R-4 — Queries become authorized

`debt.summary` and `debt.ledger` will start refusing unauthenticated callers.
That is the point, but it _is_ a behaviour change for anything already calling
them. Nothing does.

### R-5 — `is_active` semantics diverge between implementations

Fixed as part of this milestone, and pinned by TC-AUTH-003. Until now the
in-memory repository ignored `is_active` entirely, so no application test could
have caught a regression there.

### R-6 — JWT verification must not become a hand-rolled parser

Algorithm confusion, `alg: none`, unchecked `exp`, and missing issuer validation
are the classic ways a hand-written verifier fails **open**. `jose` is added for
exactly this one job — see ADR-0010.

---

## Status — complete

| Step                                                                | Done                  |
| ------------------------------------------------------------------- | --------------------- |
| Contracts: roles, permissions, codes, capabilities                  | ✅                    |
| Database: enum, columns, migrations 0002 + 0003, seed               | ✅                    |
| Ports and repositories (Drizzle + in-memory)                        | ✅                    |
| Auth infrastructure: `jose` verifier, principal resolution, context | ✅                    |
| Pipeline, six handlers, and both debt queries                       | ✅                    |
| Tests                                                               | ✅ 33 new (180 total) |
| Documentation and trace map                                         | ✅                    |
| `pnpm verify` against real PostgreSQL 17                            | ✅                    |

### Verification output

```
prettier --check .          All matched files use Prettier code style!
eslint .                    (clean)
tsc --noEmit                (clean)
boundary-check              ✓ 5 boundaries hold.
docs-check                  ✓ 51 documents, 133 internal links, 80 ids — all resolve.
trace-check                 ✓ 6 use cases, 38 rules (25 P0), 25 cases, 54 tests — all links resolve.
vitest run                  ✓ 13 files, 180 passed
                              domain 58 · application 82 · contract 18 · db 22
```

### Deviations from the plan

1. **A third migration was needed.** `actors.supabase_user_id` was generated as
   `uuid`; a JWT `sub` is a string by specification. Migration `0003` alters it to
   `text`. `0002` was left untouched — applied migrations are immutable, per this
   repository's own change protocol.
2. **`CustomerDebtSummaryDto` had to be split from the domain value.** Adding
   `capabilities` to the DTO broke the kernel, which was returning that type
   directly — correctly, because capabilities depend on _who is asking_ and the
   kernel must not know. `CustomerDebtSummary` is now the domain value and the
   application layer maps it. This kept the kernel pure rather than working
   around the constraint.
3. **Queries were authorized too**, though the milestone scope named commands.
   `debt.summary` and `debt.ledger` accepted any `workspaceId` with no
   authentication at all — a P0 leak that could not be left open while adding an
   authorization layer above it.
4. **`publicProcedure` was removed**, not just left unused. An exported
   unauthenticated procedure builder on a debt system is a footgun.

### Two bugs the work surfaced

- The in-memory repository **ignored `is_active`** while the Drizzle one honoured
  it. No application test could have caught a revoked-membership regression. Both
  now share the semantics, pinned by TC-AUTH-003.
- A self-review found a **vacuous assertion** in the new role-table test
  (`Object.keys(array).length === array.length` is always true). It now compares
  the owner's grants against `PERMISSIONS`, so adding a permission without
  granting it to the owner fails.
