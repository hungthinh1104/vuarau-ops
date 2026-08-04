import type {
  DashboardAmountWidget,
  DashboardQuantityWidget,
  DashboardSummaryDto,
  DashboardTopProductsInput,
  DashboardSeriesInput,
  OperationsBoardInput,
  DashboardOrderStatusCountsDto,
  OperationsBoardCountsInput,
} from "@vuarau/domain-contracts";
import { decodeCursor } from "@vuarau/domain-contracts";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery } from "../shared/read-pipeline.ts";

function protectSummary(summary: DashboardSummaryDto, healthy: boolean): DashboardSummaryDto {
  if (healthy) return summary;
  const unavailableAmount = (widget: DashboardAmountWidget): DashboardAmountWidget => ({
    ...widget,
    availability: {
      state: "unavailable" as const,
      diagnostics: ["workspace_integrity_attention", "report_projection_unavailable"],
      updatedAt: widget.availability.updatedAt,
    },
    amount: null,
  });
  const unavailableQuantity = (widget: DashboardQuantityWidget): DashboardQuantityWidget => ({
    ...widget,
    availability: {
      state: "unavailable",
      diagnostics: ["workspace_integrity_attention", "report_projection_unavailable"],
      updatedAt: widget.availability.updatedAt,
    },
    quantities: [],
  });
  return {
    ...summary,
    stock: unavailableQuantity(summary.stock),
    receivables: unavailableAmount(summary.receivables),
    payables: unavailableAmount(summary.payables),
    cash: unavailableAmount(summary.cash),
  };
}

export const getDashboardSummary = (
  ctx: CommandContext,
  workspaceId: DashboardSummaryDto["workspaceId"],
) =>
  runQuery({
    ctx,
    workspaceId,
    permission: "report.read",
    execute: async ({ repos }) => {
      const [summary, integrity] = await Promise.all([
        repos.dashboardReads.summary(workspaceId),
        repos.operationsReads.integrity(workspaceId),
      ]);
      return protectSummary(summary, integrity.status === "healthy");
    },
  });

export const getDashboardSeries = (ctx: CommandContext, input: DashboardSeriesInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "report.read",
    execute: ({ repos }) => repos.dashboardReads.salesSeries(input),
  });

export const getDashboardOrderStatusCounts = (
  ctx: CommandContext,
  workspaceId: DashboardOrderStatusCountsDto["workspaceId"],
) =>
  runQuery({
    ctx,
    workspaceId,
    permission: "report.read",
    execute: ({ repos }) => repos.dashboardReads.orderStatusCounts(workspaceId),
  });

export const getDashboardTopProducts = (ctx: CommandContext, input: DashboardTopProductsInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "report.read",
    execute: ({ repos }) => repos.dashboardReads.topProducts(input),
  });

export const getOperationsBoard = (ctx: CommandContext, input: OperationsBoardInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "report.read",
    execute: ({ repos }) =>
      repos.dashboardReads.operationsBoard({
        ...input,
        page: {
          after: decodeCursor(input.cursor),
          limit: input.limit,
        },
        now: ctx.deps.clock.now(),
      }),
  });

export const getOperationsBoardCounts = (ctx: CommandContext, input: OperationsBoardCountsInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "report.read",
    execute: ({ repos }) =>
      repos.dashboardReads.operationsBoardCounts({
        ...input,
        now: ctx.deps.clock.now(),
      }),
  });
