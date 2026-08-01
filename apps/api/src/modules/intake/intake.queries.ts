import type {
  ArrivalLineHistoryInput,
  GoodsArrivalGetInput,
  GoodsArrivalListInput,
  QualityDispositionGetInput,
  QualityDispositionSourceSummaryInput,
  QualityInspectionGetInput,
  QualityDispositionSourceSummaryDto,
  QualityIssueCodeSearchInput,
} from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { err } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";

export function searchQualityIssueCodes(ctx: CommandContext, input: QualityIssueCodeSearchInput) {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "intake.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.intakeReads.searchIssueCodes({
          workspaceId: input.workspaceId,
          query: input.query,
          isActive: input.isActive,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  });
}

export async function getGoodsArrival(ctx: CommandContext, input: GoodsArrivalGetInput) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "intake.read",
    execute: ({ repos }) => repos.intakeReads.arrival(input.workspaceId, input.arrivalId),
  });
  if (!result.ok) return result;
  return result.value === null
    ? err("GOODS_ARRIVAL_NOT_FOUND", "No such arrival.")
    : ({ ok: true, value: result.value } as const);
}

export function listGoodsArrivals(ctx: CommandContext, input: GoodsArrivalListInput) {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "intake.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.intakeReads.listArrivals({
          workspaceId: input.workspaceId,
          supplierId: input.supplierId,
          purchaseId: input.purchaseId,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  });
}

export async function getQualityInspection(ctx: CommandContext, input: QualityInspectionGetInput) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "intake.read",
    execute: ({ repos }) => repos.intakeReads.inspection(input.workspaceId, input.inspectionId),
  });
  if (!result.ok) return result;
  return result.value === null
    ? err("QUALITY_INSPECTION_NOT_FOUND", "No such inspection.")
    : ({ ok: true, value: result.value } as const);
}

export async function getQualityDisposition(
  ctx: CommandContext,
  input: QualityDispositionGetInput,
) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "intake.read",
    execute: ({ repos }) => repos.intakeReads.disposition(input.workspaceId, input.dispositionId),
  });
  if (!result.ok) return result;
  return result.value === null
    ? err("QUALITY_DISPOSITION_NOT_FOUND", "No such disposition.")
    : ({ ok: true, value: result.value } as const);
}

export async function getDispositionSourceSummary(
  ctx: CommandContext,
  input: QualityDispositionSourceSummaryInput,
): Promise<DomainResult<QualityDispositionSourceSummaryDto>> {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "intake.read",
    execute: ({ repos }) =>
      repos.intakeReads.dispositionSourceSummary(input.workspaceId, input.source),
  });
  if (!result.ok) return result;
  return result.value === null
    ? err("QUALITY_DISPOSITION_SOURCE_NOT_FOUND", "No such disposition source")
    : ({ ok: true, value: result.value } as const);
}

export function getArrivalLineHistory(ctx: CommandContext, input: ArrivalLineHistoryInput) {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "intake.read",
    execute: ({ repos }) =>
      repos.intakeReads.arrivalLineHistory(input.workspaceId, input.arrivalLineId),
  });
}
