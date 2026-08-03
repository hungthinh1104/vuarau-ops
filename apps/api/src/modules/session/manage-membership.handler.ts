import type {
  AddWorkspaceMemberCommand,
  ChangeWorkspaceMemberRoleCommand,
  ReactivateWorkspaceMemberCommand,
  WorkspaceMembershipDto,
} from "@vuarau/domain-contracts";
import {
  addWorkspaceMemberCommandSchema,
  changeWorkspaceMemberRoleCommandSchema,
  reactivateWorkspaceMemberCommandSchema,
  primaryWorkspaceRole,
} from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import {
  decideAddMembership,
  decideChangeMembershipRole,
  decideReactivateMembership,
  err,
  ok,
} from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";

export function addWorkspaceMember(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<WorkspaceMembershipDto>> {
  return runCommand<AddWorkspaceMemberCommand, WorkspaceMembershipDto>({
    commandType: "AddWorkspaceMember",
    schema: addWorkspaceMemberCommandSchema,
    input,
    ctx,
    requiredPermission: "workspace.manage",
    execute: async ({ command, repos, recordedAt }) => {
      const actor = await repos.actors.findById(command.payload.actorId);
      if (actor === null) {
        return err("ACTOR_NOT_FOUND", "No local actor exists for this account.", {
          actorId: command.payload.actorId,
        });
      }
      const existing = await repos.workspaces.findMembership(
        command.workspaceId,
        command.payload.actorId,
      );
      const decision = decideAddMembership({ command, existing, recordedAt });
      if (!decision.ok) return decision;

      const inserted = await repos.workspaces.addMembership(
        command.workspaceId,
        decision.value.actorId,
        decision.value.roles,
        command.actorId,
      );
      if (!inserted) {
        return err("WORKSPACE_MEMBER_ALREADY_EXISTS", "This actor is already a member.", {
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
        role: primaryWorkspaceRole(decision.value.roles),
        roles: [...decision.value.roles],
        isActive: true,
      });
    },
  });
}

export function changeWorkspaceMemberRole(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<WorkspaceMembershipDto>> {
  return runCommand<ChangeWorkspaceMemberRoleCommand, WorkspaceMembershipDto>({
    commandType: "ChangeWorkspaceMemberRole",
    schema: changeWorkspaceMemberRoleCommandSchema,
    input,
    ctx,
    requiredPermission: "workspace.manage",
    execute: async ({ command, repos, recordedAt }) => {
      const membership = await repos.workspaces.findMembership(
        command.workspaceId,
        command.payload.actorId,
      );
      if (membership === null) {
        return err("WORKSPACE_MEMBER_NOT_FOUND", "This actor is not a workspace member.", {
          actorId: command.payload.actorId,
        });
      }
      const activeOwnerCount = await repos.workspaces.countActiveOwnersForUpdate(
        command.workspaceId,
      );
      const decision = decideChangeMembershipRole({
        command,
        membership,
        activeOwnerCount,
        recordedAt,
      });
      if (!decision.ok) return decision;

      const updated = await repos.workspaces.changeMembershipRoles(
        command.workspaceId,
        command.payload.actorId,
        command.payload.expectedRoles,
        command.payload.roles,
        command.actorId,
      );
      if (!updated) {
        return err("WORKSPACE_MEMBER_ROLE_CONFLICT", "The membership changed concurrently.", {
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
        role: primaryWorkspaceRole(decision.value.roles),
        roles: [...decision.value.roles],
        isActive: true,
      });
    },
  });
}

export function reactivateWorkspaceMember(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<WorkspaceMembershipDto>> {
  return runCommand<ReactivateWorkspaceMemberCommand, WorkspaceMembershipDto>({
    commandType: "ReactivateWorkspaceMember",
    schema: reactivateWorkspaceMemberCommandSchema,
    input,
    ctx,
    requiredPermission: "workspace.manage",
    execute: async ({ command, repos, recordedAt }) => {
      const membership = await repos.workspaces.findMembership(
        command.workspaceId,
        command.payload.actorId,
      );
      if (membership === null) {
        return err("WORKSPACE_MEMBER_NOT_FOUND", "This actor is not a workspace member.", {
          actorId: command.payload.actorId,
        });
      }
      const decision = decideReactivateMembership({ command, membership, recordedAt });
      if (!decision.ok) return decision;

      const updated = await repos.workspaces.reactivateMembership(
        command.workspaceId,
        command.payload.actorId,
      );
      if (!updated) {
        return err("WORKSPACE_MEMBER_ALREADY_ACTIVE", "This membership is already active.", {
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
        role: membership.role,
        roles: [...membership.roles],
        isActive: true,
      });
    },
  });
}
