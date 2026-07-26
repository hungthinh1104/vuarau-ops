import type { IsoInstant, RevokeWorkspaceMembershipCommand } from "@vuarau/domain-contracts";
import type { AuditDraft } from "../shared/effects.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

export type MembershipFacts = {
  readonly actorId: string;
  readonly role: string;
  readonly isActive: boolean;
};

export type RevokeMembershipInput = {
  readonly command: RevokeWorkspaceMembershipCommand;
  readonly membership: MembershipFacts;
  /**
   * How many active owners the workspace has **including** this one, counted
   * inside the same transaction under a lock. Passed in because counting is I/O
   * and this function reads nothing.
   */
  readonly activeOwnerCount: number;
  readonly recordedAt: IsoInstant;
};

export type RevokeMembershipDecision = {
  readonly actorId: string;
  readonly audit: AuditDraft;
};

/**
 * T-MEMBER-001 — turning off somebody's access (UC-AUTH-002).
 *
 * Sets `is_active = false` and nothing else. The membership row stays, and
 * everything that person recorded stays with their name on it: an audit trail has
 * to keep working after somebody leaves, which is exactly when it is most needed
 * (BR-ACCOUNT-004).
 *
 * The refusal that is not obvious is BR-AUTH-007. A depot that revokes its last
 * active owner has locked itself out of its own account book with no self-service
 * remedy — every command that could restore access needs `workspace.manage`,
 * which only an owner holds. The guard costs one count; the failure costs a
 * support engineer with database access.
 *
 * There is no account effect and there never will be. Revoking access does not
 * change what anybody owes.
 */
export function decideRevokeMembership({
  command,
  membership,
  activeOwnerCount,
  recordedAt,
}: RevokeMembershipInput): DomainResult<RevokeMembershipDecision> {
  if (!membership.isActive) {
    // Already revoked. Reported rather than silently accepted, so an operator
    // learns their second attempt changed nothing.
    return err("WORKSPACE_MEMBERSHIP_INACTIVE", "This membership is already revoked.", {
      actorId: membership.actorId,
    });
  }

  if (membership.role === "owner" && activeOwnerCount <= 1) {
    return err("WORKSPACE_LAST_OWNER", "A workspace must keep at least one active owner.", {
      actorId: membership.actorId,
      activeOwnerCount,
    });
  }

  return ok({
    actorId: membership.actorId,
    audit: {
      aggregateType: "membership",
      aggregateId: membership.actorId,
      action: "membership.revoked",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { isActive: true, role: membership.role },
      after: { isActive: false, role: membership.role },
      reason: command.payload.reason,
    },
  });
}
