import type {
  ApproveWorkspacePolicyCommand,
  CreateWorkspacePolicyDraftCommand,
  RetireWorkspacePolicyCommand,
  WorkspacePolicyDto,
} from "@vuarau/domain-contracts";
import {
  approveWorkspacePolicyCommandSchema,
  createWorkspacePolicyDraftCommandSchema,
  retireWorkspacePolicyCommandSchema,
} from "@vuarau/domain-contracts";
import {
  decideApproveWorkspacePolicy,
  decideCreateWorkspacePolicyDraft,
  decideRetireWorkspacePolicy,
  err,
  ok,
} from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";

export function createWorkspacePolicyDraft(ctx: CommandContext, input: unknown) {
  return runCommand<CreateWorkspacePolicyDraftCommand, WorkspacePolicyDto>({
    commandType: "CreateWorkspacePolicyDraft",
    schema: createWorkspacePolicyDraftCommandSchema,
    input,
    ctx,
    requiredPermission: "policy.manage",
    execute: async ({ command, repos, recordedAt }) => {
      const decision = decideCreateWorkspacePolicyDraft(command, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.workspacePolicies.insert(decision.value.policy))) {
        return err(
          "WORKSPACE_POLICY_ALREADY_EXISTS",
          "A policy version with this identity or version already exists.",
        );
      }
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(decision.value.policy);
    },
  });
}

export function approveWorkspacePolicy(ctx: CommandContext, input: unknown) {
  return runCommand<ApproveWorkspacePolicyCommand, WorkspacePolicyDto>({
    commandType: "ApproveWorkspacePolicy",
    schema: approveWorkspacePolicyCommandSchema,
    input,
    ctx,
    requiredPermission: "policy.manage",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.workspacePolicies.findById(
        command.workspaceId,
        command.payload.policyVersionId,
      );
      const existingPolicies =
        current === null
          ? []
          : await repos.workspacePolicies.listForUpdate(command.workspaceId, current.policyKind);
      const decision = decideApproveWorkspacePolicy(command, current, recordedAt, existingPolicies);
      if (!decision.ok) return decision;
      if (!(await repos.workspacePolicies.update(decision.value.policy, "draft"))) {
        return err("WORKSPACE_POLICY_VERSION_CONFLICT", "Policy version changed concurrently.");
      }
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(decision.value.policy);
    },
  });
}

export function retireWorkspacePolicy(ctx: CommandContext, input: unknown) {
  return runCommand<RetireWorkspacePolicyCommand, WorkspacePolicyDto>({
    commandType: "RetireWorkspacePolicy",
    schema: retireWorkspacePolicyCommandSchema,
    input,
    ctx,
    requiredPermission: "policy.manage",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.workspacePolicies.findById(
        command.workspaceId,
        command.payload.policyVersionId,
      );
      const decision = decideRetireWorkspacePolicy(command, current, recordedAt);
      if (!decision.ok) return decision;
      if (
        !(await repos.workspacePolicies.update(decision.value.policy, decision.value.expectedState))
      ) {
        return err("WORKSPACE_POLICY_VERSION_CONFLICT", "Policy version changed concurrently.");
      }
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(decision.value.policy);
    },
  });
}
