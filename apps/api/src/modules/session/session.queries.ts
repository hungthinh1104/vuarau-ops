import type { SessionDto, WorkspaceId } from "@vuarau/domain-contracts";
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
