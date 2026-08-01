import type {
  RevokeWorkspaceMembershipCommand,
  WorkspaceMembershipDto,
} from "@vuarau/domain-contracts";
import { revokeWorkspaceMembershipCommandSchema } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { decideRevokeMembership, err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";

/**
 * UC-AUTH-002 — turning off somebody's access.
 *
 * The membership row is not deleted and nothing that person recorded is touched:
 * their sales stand, their payments stand, and every account entry still names
 * them (BR-ACCOUNT-004). An audit trail has to keep working after somebody
 * leaves, which is precisely when it is most needed.
 *
 * **Effect is immediate on the next request.** Membership is re-read on every
 * command and every query, so there is no session to expire and no cache to
 * invalidate. Their bearer token stays cryptographically valid until it expires —
 * there is no revocation list (ADR-0010) — but the token alone grants nothing.
 */
export function revokeWorkspaceMembership(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<WorkspaceMembershipDto>> {
  return runCommand<RevokeWorkspaceMembershipCommand, WorkspaceMembershipDto>({
    commandType: "RevokeWorkspaceMembership",
    schema: revokeWorkspaceMembershipCommandSchema,
    input,
    ctx,
    requiredPermission: "workspace.manage",
    execute: async ({ command, repos, recordedAt }) => {
      const target = await repos.workspaces.findMembership(
        command.workspaceId,
        command.payload.actorId,
      );
      if (target === null) {
        return err("WORKSPACE_ACCESS_DENIED", "That actor is not a member of this workspace.", {
          workspaceId: command.workspaceId,
          actorId: command.payload.actorId,
        });
      }

      // Counted under a lock **before** the decision, so two owners revoking each
      // other at the same moment cannot both see a count of two (BR-AUTH-007).
      const activeOwnerCount = await repos.workspaces.countActiveOwnersForUpdate(
        command.workspaceId,
      );

      const decision = decideRevokeMembership({
        command,
        membership: { actorId: target.actorId, roles: target.roles, isActive: target.isActive },
        activeOwnerCount,
        recordedAt,
      });
      if (!decision.ok) {
        return decision;
      }

      const revoked = await repos.workspaces.revokeMembership(
        command.workspaceId,
        command.payload.actorId,
      );
      if (!revoked) {
        // Somebody else revoked them between the read and the write. The end
        // state is the one asked for, but saying so is more honest than
        // reporting a success this command did not cause.
        return err("WORKSPACE_MEMBERSHIP_INACTIVE", "This membership is already revoked.", {
          actorId: command.payload.actorId,
        });
      }

      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });

      return ok({
        workspaceId: command.workspaceId,
        actorId: command.payload.actorId,
        role: target.role,
        roles: [...target.roles],
        isActive: false,
      });
    },
  });
}
