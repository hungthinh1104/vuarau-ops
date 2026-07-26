import type {
  ActorId,
  DebtCapabilities,
  Permission,
  WorkspaceId,
  WorkspaceRole,
} from "@vuarau/domain-contracts";
import { ALLOWED, denied, roleHasPermission } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { err, ok } from "@vuarau/domain-kernel";
import type { Repositories, WorkspaceMembership } from "../../infrastructure/persistence/ports.ts";
import type { AuthenticatedPrincipal } from "../../infrastructure/auth/principal.ts";

/**
 * The one authorization decision in the system, shared by commands and queries
 * so that a read cannot accidentally be laxer than the write beside it
 * (BR-AUTH-001 … BR-AUTH-004).
 *
 * Order matters, and each step answers a different operator question:
 *
 *   1. is the caller claiming to be somebody else?   → ACTOR_IMPERSONATION_DENIED
 *   2. are they a member of this workspace at all?   → WORKSPACE_ACCESS_DENIED
 *   3. was their membership revoked?                 → WORKSPACE_MEMBERSHIP_INACTIVE
 *   4. does their role carry this permission?        → PERMISSION_DENIED
 *
 * Steps 2 and 3 are separate codes on purpose. "You were never a member" and
 * "your access was turned off" have different remedies, and collapsing them into
 * one message sends the depot owner looking in the wrong place.
 */
export async function authorizeWorkspaceAccess(args: {
  readonly repos: Repositories;
  readonly principal: AuthenticatedPrincipal;
  readonly workspaceId: WorkspaceId;
  readonly permission: Permission;
  /**
   * The `actorId` the request claimed, when there is one. Commands carry it in
   * their envelope; queries do not.
   */
  readonly claimedActorId?: ActorId;
}): Promise<DomainResult<WorkspaceMembership>> {
  const { repos, principal, workspaceId, permission, claimedActorId } = args;

  if (claimedActorId !== undefined && claimedActorId !== principal.actorId) {
    return err(
      "ACTOR_IMPERSONATION_DENIED",
      "A command may only be issued on behalf of the authenticated actor.",
      { claimedActorId, authenticatedActorId: principal.actorId },
    );
  }

  const membership = await repos.workspaces.findMembership(workspaceId, principal.actorId);

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

  if (!roleHasPermission(membership.role, permission)) {
    return err("PERMISSION_DENIED", `Your role cannot perform "${permission}".`, {
      workspaceId,
      permission,
      role: membership.role,
    });
  }

  return ok(membership);
}

/**
 * Unlike order and payment capabilities — which come from aggregate state and are
 * computed in the kernel — this one depends on *who is asking*, so it lives here.
 *
 * It calls `roleHasPermission`, the same function the authorization check uses.
 * One implementation, so a greyed-out button and a refusal cannot disagree
 * (ADR-0003).
 */
export function debtCapabilities(role: WorkspaceRole): DebtCapabilities {
  return {
    adjust: roleHasPermission(role, "debt.adjust")
      ? ALLOWED
      : denied("PERMISSION_DENIED", { permission: "debt.adjust", role }),
  };
}
