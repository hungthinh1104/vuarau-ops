import type { ActorWorkspacesDto, SessionDto, WorkspaceId } from "@vuarau/domain-contracts";
import { permissionsForRole } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";

/**
 * UC-AUTH-003 — the first call a client makes.
 *
 * It does not go through `runQuery`, because it requires no permission: the
 * answer *is* the permission list, and demanding one to read it would be
 * circular. It still requires a verified identity and an active membership, so a
 * revoked worker learns immediately rather than from the first command they try
 * (BR-AUTH-003). Those two checks are the middle two of
 * `authorizeWorkspaceAccess`; the impersonation check has nothing to compare
 * against on a read, and the permission check is the one deliberately absent.
 *
 * The permission list is expanded server-side rather than sent as a role name. A
 * client that mapped roles to permissions itself would be a client that silently
 * disagrees with the server the day the table changes (ADR-0011).
 */
export function getSession(
  ctx: CommandContext,
  workspaceId: WorkspaceId,
): Promise<DomainResult<SessionDto>> {
  return ctx.deps.uow.transaction(async (repos) => {
    const membership = await repos.workspaces.findMembership(workspaceId, ctx.principal.actorId);

    if (membership === null) {
      return err("WORKSPACE_ACCESS_DENIED", "You do not have access to this workspace.", {
        workspaceId,
      });
    }
    if (!membership.isActive) {
      return err("WORKSPACE_MEMBERSHIP_INACTIVE", "Your access to this workspace was revoked.", {
        workspaceId,
      });
    }

    return ok({
      actorId: ctx.principal.actorId,
      workspaceId,
      role: membership.role,
      permissions: [...permissionsForRole(membership.role)],
    });
  });
}

/**
 * UC-AUTH-004 — which depots this caller may act in (BR-AUTH-008).
 *
 * Like `getSession`, it does not go through `runQuery`, and for a sharper reason:
 * `runQuery` takes a workspace id and a permission held *within* that workspace.
 * This is the query asked when no workspace is known yet, so there is nothing to
 * scope it to and nothing to check a permission against. Requiring one would be
 * circular in the same way `session.me` would be.
 *
 * What replaces the permission check is that **the query has no input**. The actor
 * comes from `ctx.principal`, which the transport resolved from a verified token
 * and which no request body can influence (BR-AUTH-002). There is no field to
 * tamper with, so there is no cross-actor read to prevent — a stronger property
 * than a check, because it cannot be forgotten by the next procedure.
 *
 * Inactive memberships are excluded in the repository, not filtered here. A
 * revoked worker sees an empty list, which is the same thing a stranger with a
 * valid Supabase account sees, and telling those two apart is not a client's
 * business (BR-AUTH-003).
 */
export function listActorWorkspaces(
  ctx: CommandContext,
): Promise<DomainResult<ActorWorkspacesDto>> {
  return ctx.deps.uow.transaction(async (repos) => {
    const memberships = await repos.actors.listActiveWorkspaces(ctx.principal.actorId);

    return ok({
      actorId: ctx.principal.actorId,
      workspaces: memberships.map((membership) => ({
        workspaceId: membership.workspaceId,
        name: membership.workspaceName,
        role: membership.role,
        permissions: [...permissionsForRole(membership.role)],
      })),
    });
  });
}
