import type {
  ManagementIntelligenceDto,
  ManagementIntelligencePolicyDefinition,
  OperationalReportDto,
  ReportType,
  WorkspaceId,
  WorkspacePolicyVersionId,
} from "@vuarau/domain-contracts";

export type ManagementIntelligenceSnapshot = {
  readonly reportType: ReportType;
  readonly report: OperationalReportDto;
};

export type ManagementIntelligenceCalculationInput = {
  readonly workspaceId: WorkspaceId;
  readonly asOf: ManagementIntelligenceDto["asOf"];
  readonly businessDate: string | null;
  readonly policy: ManagementIntelligencePolicyDefinition;
  readonly policyVersionId: WorkspacePolicyVersionId;
  readonly policyVersion: number;
  readonly snapshots: readonly ManagementIntelligenceSnapshot[];
};

function unavailable(
  input: ManagementIntelligenceCalculationInput,
  diagnostics: readonly string[],
  sourceReportTypes: readonly ReportType[],
): ManagementIntelligenceDto {
  return {
    workspaceId: input.workspaceId,
    asOf: input.asOf,
    businessDate: input.businessDate,
    status: "unavailable",
    policyVersionId: input.policyVersionId,
    policyVersion: input.policyVersion,
    strategy: input.policy.parameters.strategy,
    calculationVersion: "management-intelligence-v1",
    diagnostics: [...new Set(diagnostics)],
    sourceReportTypes: [...sourceReportTypes],
    indicators: [],
  };
}

/**
 * Copies already-defined operational report totals into a policy-selected,
 * source-labelled management snapshot. It intentionally performs no new
 * financial, inventory or business interpretation.
 */
export function calculateManagementIntelligence(
  input: ManagementIntelligenceCalculationInput,
): ManagementIntelligenceDto {
  const reportTypes = [...input.policy.parameters.reportTypes].sort();
  const snapshotsByType = new Map(
    input.snapshots.map((snapshot) => [snapshot.reportType, snapshot]),
  );
  const missing = reportTypes.filter((reportType) => !snapshotsByType.has(reportType));
  if (missing.length > 0) {
    return unavailable(input, ["missing_management_source_report"], reportTypes);
  }

  const attention = reportTypes.filter(
    (reportType) => snapshotsByType.get(reportType)?.report.integrity !== "healthy",
  );
  if (attention.length > 0) {
    return unavailable(input, ["management_source_integrity_attention"], reportTypes);
  }

  return {
    workspaceId: input.workspaceId,
    asOf: input.asOf,
    businessDate: input.businessDate,
    status: "available",
    policyVersionId: input.policyVersionId,
    policyVersion: input.policyVersion,
    strategy: input.policy.parameters.strategy,
    calculationVersion: "management-intelligence-v1",
    diagnostics: [],
    sourceReportTypes: reportTypes,
    indicators: reportTypes.map((reportType) => {
      const report = snapshotsByType.get(reportType)!.report;
      return {
        reportType,
        businessDate: report.businessDate,
        integrity: report.integrity,
        totals: report.totals,
        sourceReportType: reportType,
        diagnostics: [...report.diagnostics],
      };
    }),
  };
}
