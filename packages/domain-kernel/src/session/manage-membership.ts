import type {
  AddWorkspaceMemberCommand,
  ActorId,
  ChangeWorkspaceMemberRoleCommand,
  IsoInstant,
  ReactivateWorkspaceMemberCommand,
  WorkspaceRole,
} from "@vuarau/domain-contracts";
import { normalizeWorkspaceRoles } from "@vuarau/domain-contracts";
import type { AuditDraft } from "../shared/effects.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

type MembershipFacts = {
  readonly actorId: ActorId;
  readonly roles: readonly WorkspaceRole[];
  readonly isActive: boolean;
};

type MembershipDecision = {
  readonly actorId: ActorId;
  readonly roles: readonly WorkspaceRole[];
  readonly isActive: boolean;
  readonly audit: AuditDraft;
};

function sameRoles(left: readonly WorkspaceRole[], right: readonly WorkspaceRole[]): boolean {
  const normalizedLeft = normalizeWorkspaceRoles(left);
  const normalizedRight = normalizeWorkspaceRoles(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((role, index) => role === normalizedRight[index])
  );
}

export function decideAddMembership(args: {
  command: AddWorkspaceMemberCommand;
  existing: MembershipFacts | null;
  recordedAt: IsoInstant;
}): DomainResult<MembershipDecision> {
  if (args.existing !== null) {
    return err(
      "WORKSPACE_MEMBER_ALREADY_EXISTS",
      "This actor already has a membership record in the workspace.",
      { actorId: args.command.payload.actorId, isActive: args.existing.isActive },
    );
  }
  const roles = normalizeWorkspaceRoles(args.command.payload.roles);
  return ok({
    actorId: args.command.payload.actorId,
    roles,
    isActive: true,
    audit: {
      aggregateType: "membership",
      aggregateId: args.command.payload.actorId,
      action: "membership.added",
      transactionTime: args.command.occurredAt,
      recordedAt: args.recordedAt,
      before: null,
      after: { roles, isActive: true },
      reason: args.command.payload.reason,
    },
  });
}

export function decideChangeMembershipRole(args: {
  command: ChangeWorkspaceMemberRoleCommand;
  membership: MembershipFacts;
  activeOwnerCount: number;
  recordedAt: IsoInstant;
}): DomainResult<MembershipDecision> {
  const { command, membership } = args;
  if (!membership.isActive) {
    return err("WORKSPACE_MEMBERSHIP_INACTIVE", "This membership is inactive.", {
      actorId: membership.actorId,
    });
  }
  if (membership.actorId === command.actorId) {
    return err(
      "WORKSPACE_MEMBER_SELF_ROLE_CHANGE_DENIED",
      "A member cannot change their own roles.",
      { actorId: membership.actorId },
    );
  }
  if (!sameRoles(membership.roles, command.payload.expectedRoles)) {
    return err("WORKSPACE_MEMBER_ROLE_CONFLICT", "The membership roles changed.", {
      actorId: membership.actorId,
      expectedRoles: command.payload.expectedRoles,
      actualRoles: membership.roles,
    });
  }

  const roles = normalizeWorkspaceRoles(command.payload.roles);
  if (sameRoles(membership.roles, roles)) {
    return err("WORKSPACE_MEMBER_ROLE_UNCHANGED", "The membership already has these roles.", {
      actorId: membership.actorId,
      roles,
    });
  }
  if (
    membership.roles.includes("owner") &&
    !roles.includes("owner") &&
    args.activeOwnerCount <= 1
  ) {
    return err("WORKSPACE_LAST_OWNER", "A workspace must keep at least one active owner.", {
      actorId: membership.actorId,
      activeOwnerCount: args.activeOwnerCount,
    });
  }
  return ok({
    actorId: membership.actorId,
    roles,
    isActive: true,
    audit: {
      aggregateType: "membership",
      aggregateId: membership.actorId,
      action: "membership.role_changed",
      transactionTime: command.occurredAt,
      recordedAt: args.recordedAt,
      before: { roles: normalizeWorkspaceRoles(membership.roles), isActive: true },
      after: { roles, isActive: true },
      reason: command.payload.reason,
    },
  });
}

export function decideReactivateMembership(args: {
  command: ReactivateWorkspaceMemberCommand;
  membership: MembershipFacts;
  recordedAt: IsoInstant;
}): DomainResult<MembershipDecision> {
  if (args.membership.isActive) {
    return err("WORKSPACE_MEMBER_ALREADY_ACTIVE", "This membership is already active.", {
      actorId: args.membership.actorId,
    });
  }
  const roles = normalizeWorkspaceRoles(args.membership.roles);
  return ok({
    actorId: args.membership.actorId,
    roles,
    isActive: true,
    audit: {
      aggregateType: "membership",
      aggregateId: args.membership.actorId,
      action: "membership.reactivated",
      transactionTime: args.command.occurredAt,
      recordedAt: args.recordedAt,
      before: { roles, isActive: false },
      after: { roles, isActive: true },
      reason: args.command.payload.reason,
    },
  });
}
