import type {
  AddWorkspaceMemberCommand,
  ActorId,
  ChangeWorkspaceMemberRoleCommand,
  IsoInstant,
  ReactivateWorkspaceMemberCommand,
  WorkspaceRole,
} from "@vuarau/domain-contracts";
import type { AuditDraft } from "../shared/effects.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

type MembershipFacts = {
  readonly actorId: ActorId;
  readonly role: WorkspaceRole;
  readonly isActive: boolean;
};

type MembershipDecision = {
  readonly actorId: ActorId;
  readonly role: WorkspaceRole;
  readonly isActive: boolean;
  readonly audit: AuditDraft;
};

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
  return ok({
    actorId: args.command.payload.actorId,
    role: args.command.payload.role,
    isActive: true,
    audit: {
      aggregateType: "membership",
      aggregateId: args.command.payload.actorId,
      action: "membership.added",
      transactionTime: args.command.occurredAt,
      recordedAt: args.recordedAt,
      before: null,
      after: { role: args.command.payload.role, isActive: true },
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
      "A member cannot change their own role.",
      { actorId: membership.actorId },
    );
  }
  if (membership.role !== command.payload.expectedRole) {
    return err("WORKSPACE_MEMBER_ROLE_CONFLICT", "The membership role changed.", {
      actorId: membership.actorId,
      expectedRole: command.payload.expectedRole,
      actualRole: membership.role,
    });
  }
  if (membership.role === command.payload.role) {
    return err("WORKSPACE_MEMBER_ROLE_UNCHANGED", "The membership already has this role.", {
      actorId: membership.actorId,
      role: membership.role,
    });
  }
  if (
    membership.role === "owner" &&
    command.payload.role !== "owner" &&
    args.activeOwnerCount <= 1
  ) {
    return err("WORKSPACE_LAST_OWNER", "A workspace must keep at least one active owner.", {
      actorId: membership.actorId,
      activeOwnerCount: args.activeOwnerCount,
    });
  }
  return ok({
    actorId: membership.actorId,
    role: command.payload.role,
    isActive: true,
    audit: {
      aggregateType: "membership",
      aggregateId: membership.actorId,
      action: "membership.role_changed",
      transactionTime: command.occurredAt,
      recordedAt: args.recordedAt,
      before: { role: membership.role, isActive: true },
      after: { role: command.payload.role, isActive: true },
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
  return ok({
    actorId: args.membership.actorId,
    role: args.membership.role,
    isActive: true,
    audit: {
      aggregateType: "membership",
      aggregateId: args.membership.actorId,
      action: "membership.reactivated",
      transactionTime: args.command.occurredAt,
      recordedAt: args.recordedAt,
      before: { role: args.membership.role, isActive: false },
      after: { role: args.membership.role, isActive: true },
      reason: args.command.payload.reason,
    },
  });
}
