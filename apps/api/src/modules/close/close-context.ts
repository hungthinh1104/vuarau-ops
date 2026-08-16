import type {
  OperationalCloseDto,
  OperationalClosePolicyDefinition,
  WorkspaceId,
  WorkspaceOperationalProfileDto,
  WorkspacePolicyDto,
} from "@vuarau/domain-contracts";
import {
  operationalClosePolicyDefinitionSchema,
  vietnamBusinessDayRange,
} from "@vuarau/domain-contracts";
import { resolvePolicyForDecision } from "@vuarau/domain-kernel";
import type { Repositories } from "../../infrastructure/persistence/ports.ts";

/**
 * Close deliberately has one scope: every currently open Board condition in
 * the workspace is relevant. A later date-local policy must be an explicit
 * contract addition, not an incidental filter in either the screen or writer.
 */
export const OPERATIONAL_CLOSE_EXCEPTION_SCOPE = "global_open_work" as const;

export type OperationalCloseContext = {
  readonly period: OperationalCloseDto["period"];
  readonly policy: WorkspacePolicyDto | null;
  readonly policyDefinition: OperationalClosePolicyDefinition | null;
  readonly currentClose: OperationalCloseDto | null;
  readonly exceptionScope: typeof OPERATIONAL_CLOSE_EXCEPTION_SCOPE;
};

export async function loadOperationalCloseContext(args: {
  repos: Repositories;
  workspaceId: WorkspaceId;
  businessDate: string;
  knowledgeAt: string;
  operationalProfile: WorkspaceOperationalProfileDto;
}): Promise<OperationalCloseContext> {
  const period = vietnamBusinessDayRange(
    args.businessDate,
    args.operationalProfile.businessDayStartMinute,
  );
  const [policies, currentClose] = await Promise.all([
    args.repos.workspacePolicyReads.listAll(args.workspaceId),
    args.repos.operationalCloses.findByBusinessDate(args.workspaceId, args.businessDate),
  ]);
  const policy = resolvePolicyForDecision(
    policies,
    "operating_cycle_reconciliation",
    period.end,
    args.knowledgeAt,
  );
  const definition =
    policy === null ? null : operationalClosePolicyDefinitionSchema.safeParse(policy.definition);
  return {
    period,
    policy,
    policyDefinition: definition?.success ? definition.data : null,
    currentClose,
    exceptionScope: OPERATIONAL_CLOSE_EXCEPTION_SCOPE,
  };
}
