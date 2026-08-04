import {
  defaultWorkspaceOperationalProfile,
  managementIntelligencePolicyDefinitionSchema,
  type ManagementIntelligenceInput,
  type ManagementIntelligenceDto,
} from "@vuarau/domain-contracts";
import { calculateManagementIntelligence, resolvePolicyForDecision } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery } from "../shared/read-pipeline.ts";

const snapshotPage = { after: null, limit: 1 } as const;

function unavailable(
  input: ManagementIntelligenceInput,
  policyVersionId: ManagementIntelligenceDto["policyVersionId"],
  policyVersion: ManagementIntelligenceDto["policyVersion"],
  diagnostics: readonly string[],
): ManagementIntelligenceDto {
  return {
    workspaceId: input.workspaceId,
    asOf: input.asOf,
    businessDate: input.businessDate,
    status: "unavailable",
    policyVersionId,
    policyVersion,
    strategy: null,
    calculationVersion: "management-intelligence-v1",
    diagnostics: [...diagnostics],
    sourceReportTypes: [],
    indicators: [],
  };
}

export function getManagementIntelligence(ctx: CommandContext, input: ManagementIntelligenceInput) {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "report.read",
    execute: async ({ repos }) => {
      const calculatedAt = ctx.deps.clock.now();
      const policy = resolvePolicyForDecision(
        await repos.workspacePolicyReads.listAll(input.workspaceId),
        "management_intelligence",
        input.asOf,
        calculatedAt,
      );
      if (policy === null) {
        return unavailable(input, null, null, ["no_effective_management_intelligence_policy"]);
      }
      const definition = managementIntelligencePolicyDefinitionSchema.safeParse(policy.definition);
      if (!definition.success) {
        return unavailable(input, policy.id, policy.version, [
          "invalid_management_intelligence_policy",
        ]);
      }
      const profile =
        (await repos.workspaces.findOperationalProfile(input.workspaceId)) ??
        defaultWorkspaceOperationalProfile(input.workspaceId);
      const snapshots = await Promise.all(
        definition.data.parameters.reportTypes.map(async (reportType) => ({
          reportType,
          report: await repos.reportReads.operational({
            workspaceId: input.workspaceId,
            reportType,
            businessDate: input.businessDate,
            businessDayStartMinute: profile.businessDayStartMinute,
            productId: null,
            unit: null,
            page: snapshotPage,
          }),
        })),
      );
      return calculateManagementIntelligence({
        workspaceId: input.workspaceId,
        asOf: input.asOf,
        businessDate: input.businessDate,
        policy: definition.data,
        policyVersionId: policy.id,
        policyVersion: policy.version,
        snapshots,
      });
    },
  });
}
