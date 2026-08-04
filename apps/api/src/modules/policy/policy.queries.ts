import type {
  WorkspacePolicyAvailabilityInput,
  WorkspacePolicyGetInput,
  WorkspacePolicyListInput,
} from "@vuarau/domain-contracts";
import { err, ok, resolveWorkspacePolicyAvailability } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";

export async function getWorkspacePolicy(ctx: CommandContext, input: WorkspacePolicyGetInput) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "policy.read",
    execute: ({ repos }) =>
      repos.workspacePolicyReads.findById(input.workspaceId, input.policyVersionId),
  });
  if (!result.ok) return result;
  return result.value === null
    ? err("WORKSPACE_POLICY_NOT_FOUND", "Policy version was not found.")
    : ok(result.value);
}

export function listWorkspacePolicies(ctx: CommandContext, input: WorkspacePolicyListInput) {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "policy.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.workspacePolicyReads.list({
          workspaceId: input.workspaceId,
          policyKind: input.policyKind,
          state: input.state,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  });
}

export function getWorkspacePolicyAvailability(
  ctx: CommandContext,
  input: WorkspacePolicyAvailabilityInput,
) {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "policy.read",
    execute: async ({ repos }) =>
      resolveWorkspacePolicyAvailability(
        await repos.workspacePolicyReads.listAll(input.workspaceId),
        input.asOf,
        ctx.deps.clock.now(),
      ),
  });
}
