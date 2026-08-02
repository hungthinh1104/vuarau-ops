import type {
  UpdateWorkspaceOperationalProfileCommand,
  WorkspaceId,
  WorkspaceOperationalProfileDto,
} from "@vuarau/domain-contracts";
import {
  defaultWorkspaceOperationalProfile,
  updateWorkspaceOperationalProfileCommandSchema,
} from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { decideUpdateWorkspaceOperationalProfile, err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { authorizeWorkspaceAccess } from "../shared/authorization.ts";

export function getWorkspaceOperationalProfile(
  ctx: CommandContext,
  workspaceId: WorkspaceId,
): Promise<DomainResult<WorkspaceOperationalProfileDto>> {
  return ctx.deps.uow.transaction(async (repos) => {
    const authorized = await authorizeWorkspaceAccess({
      repos,
      principal: ctx.principal,
      workspaceId,
      permission: "customer.read",
    });
    if (!authorized.ok) return authorized;
    const profile = await repos.workspaces.findOperationalProfile(workspaceId);
    return ok(profile ?? defaultWorkspaceOperationalProfile(workspaceId));
  });
}

export function updateWorkspaceOperationalProfile(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<WorkspaceOperationalProfileDto>> {
  return runCommand<UpdateWorkspaceOperationalProfileCommand, WorkspaceOperationalProfileDto>({
    commandType: "UpdateWorkspaceOperationalProfile",
    schema: updateWorkspaceOperationalProfileCommandSchema,
    input,
    ctx,
    requiredPermission: "workspace.manage",
    execute: async ({ command, repos, recordedAt }) => {
      const current =
        (await repos.workspaces.findOperationalProfile(command.workspaceId)) ??
        defaultWorkspaceOperationalProfile(command.workspaceId);
      const decision = decideUpdateWorkspaceOperationalProfile({
        command,
        current,
        recordedAt,
      });
      if (!decision.ok) return decision;
      const updated = await repos.workspaces.updateOperationalProfile(
        decision.value.profile,
        current.version,
      );
      if (!updated) {
        return err("WORKSPACE_PROFILE_VERSION_CONFLICT", "Workspace profile changed concurrently.");
      }
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(decision.value.profile);
    },
  });
}
