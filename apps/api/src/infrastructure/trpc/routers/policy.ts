import {
  approveWorkspacePolicyCommandSchema,
  createWorkspacePolicyDraftCommandSchema,
  retireWorkspacePolicyCommandSchema,
  workspacePolicyAvailabilityInputSchema,
  workspacePolicyGetInputSchema,
  workspacePolicyListInputSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "../trpc.ts";
import {
  approveWorkspacePolicy,
  createWorkspacePolicyDraft,
  retireWorkspacePolicy,
} from "../../../modules/policy/policy.handlers.ts";
import {
  getWorkspacePolicy,
  getWorkspacePolicyAvailability,
  listWorkspacePolicies,
} from "../../../modules/policy/policy.queries.ts";

export const policyRouter = router({
  createDraft: commandProcedure
    .input(createWorkspacePolicyDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createWorkspacePolicyDraft(ctx, input))),
  approve: commandProcedure
    .input(approveWorkspacePolicyCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await approveWorkspacePolicy(ctx, input))),
  retire: commandProcedure
    .input(retireWorkspacePolicyCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await retireWorkspacePolicy(ctx, input))),
  get: authenticatedProcedure
    .input(workspacePolicyGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getWorkspacePolicy(ctx, input))),
  list: authenticatedProcedure
    .input(workspacePolicyListInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listWorkspacePolicies(ctx, input))),
  availability: authenticatedProcedure
    .input(workspacePolicyAvailabilityInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getWorkspacePolicyAvailability(ctx, input))),
});
