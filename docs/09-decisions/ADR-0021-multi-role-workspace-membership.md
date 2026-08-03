# ADR-0021 — One workspace membership may carry several operational roles

**Status:** accepted and implemented · 2026-08-01

## Context

The current authorization model stores one `role` on each
`workspace_memberships` row. That is simple and safe for a depot where jobs are
strictly separated, but it does not represent a common small-team reality: one
person may sell in the morning, receive or dispatch goods later, and reconcile
money at closing time.

Assigning that person `owner` only to obtain the union of those permissions is not
an acceptable shortcut. `owner` also grants membership administration, Sale void,
debt adjustment, recovery operations and every future permission. The stored role
would stop describing the person's work and least privilege would disappear.

This ADR does not ratify the existing role→permission table. ASM-017 still requires
owner validation of that table. It defines how several validated roles compose.

## Decision

1. Keep one lifecycle membership per `(workspace, actor)`. It answers whether the
   person has access and preserves one revocation boundary.
2. Move role assignment to a normalized relation:
   `workspace_membership_roles(workspace_id, actor_id, role, assigned_at,
assigned_by)` with a unique key on `(workspace_id, actor_id, role)`.
3. An active membership must carry at least one role. Its effective permissions are
   the deterministic union of `ROLE_PERMISSIONS` for all assigned roles.
4. `owner` is exclusive in the stored role set. It already contains every
   permission; storing `owner + warehouse` communicates no additional authority
   and makes review misleading.
5. Role-set changes are versioned as one intent. The command carries
   `expectedRoles` and the complete replacement set; the server never performs a
   silent per-role merge against a stale screen.
6. The last-active-owner invariant is evaluated against memberships whose role set
   contains `owner`. No command may remove or revoke the final active owner.
7. Session and workspace-member DTOs expose both:
   - `roles`, sorted in the fixed workspace-role order;
   - `permissions`, deduplicated and server-derived from that role set.
8. A permission denial names the required permission and the caller's full role
   set. UI capability checks consume server-authored permissions and do not repeat
   union logic.
9. Role assignment/removal is audited with complete before/after role sets,
   assigning actor and transaction/recorded time.
10. This remains a static role model. No per-person permission exceptions, amount
    limits or policy DSL are introduced by multi-role support.

## Migration

1. Create `workspace_membership_roles` while retaining the current `role` column.
2. Backfill exactly one role row from every existing membership.
3. Authorization, session and member reads use the normalized relation and fall
   back to `[legacy role]` only for imported or pre-backfill rows.
4. Every repository-owned create/update path writes the role relation and keeps
   the legacy column as a deterministic primary projection. A deferred PostgreSQL
   constraint trigger rejects owner combinations and projection drift at commit.
5. Remove the legacy column only after PostgreSQL evidence proves every live row
   has a matching role set and operational tooling no longer reads the projection.

The migration must not convert existing users to a broader role set. Multi-role is
an explicit later assignment by an authorized owner.

## Invariants and required evidence

- Inactive membership grants no permission even if role rows remain for history.
- Empty role set is structurally or transactionally impossible for an active member.
- Permission union is deterministic and identical in command guards, queries,
  session DTOs and UI capability rendering.
- Retrying the same role-set command cannot duplicate role rows or audit effects.
- Concurrent role-set edits produce one winner and a stale-version refusal.
- Workspace isolation applies to every role row.
- Backup exports role sets as control-plane evidence. Restore does not import source memberships into the recovery workspace; the target keeps its own access control and last-owner invariant.

## Alternatives considered

| Alternative                              | Why rejected                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Make multi-job workers `owner`           | Over-grants financial, recovery and membership authority.                                                                                                     |
| Store a role array on the membership row | Easy to write, harder to constrain, query and audit per assignment; PostgreSQL uniqueness and foreign-key evidence become weaker.                             |
| Store arbitrary permissions per user     | Produces bespoke policies that cannot be reviewed as a small fixed matrix.                                                                                    |
| Switch roles manually during the day     | Authority would depend on UI mode rather than the person's actual assignment; background/retried commands could be evaluated under a different selected role. |

## Consequences

**Good.** A small depot can model real overlapping jobs without using `owner` as an
escape hatch. Permission review remains role-based and readable.

**Cost.** Session, membership management, authorization ports, migrations, backup,
restore, tests and UI all change together. This is not a DTO-only change.

**Still unresolved.** Which combinations are operationally valid, whether some
permissions require dual control, and whether a driver may record collected cash
remain ASM-017 field decisions.

## Revisit when

Revisit after the depot owner validates ASM-017, before the legacy `role` column is removed, and
again if a future requirement needs per-person exceptions, approval thresholds or
dual-control rather than a union of fixed roles.

## Related

- [ADR-0011](ADR-0011-role-permission-mapping.md)
- [ADR-0020](ADR-0020-application-workspace-isolation.md)
- [authorization rules](../04-business-rules/authorization-rules.md)
- [decision backlog](decision-backlog.md)
