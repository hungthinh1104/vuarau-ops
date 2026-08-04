import {
  dashboardSeriesInputSchema,
  dashboardSummaryInputSchema,
  dashboardTopProductsInputSchema,
  operationsBoardCountsInputSchema,
  operationsBoardInputSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, router, unwrap } from "../trpc.ts";
import {
  getDashboardOrderStatusCounts,
  getDashboardSeries,
  getDashboardSummary,
  getDashboardTopProducts,
  getOperationsBoard,
  getOperationsBoardCounts,
} from "../../../modules/dashboard/dashboard.queries.ts";

export const dashboardRouter = router({
  summary: authenticatedProcedure
    .input(dashboardSummaryInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getDashboardSummary(ctx, input.workspaceId))),
  salesSeries: authenticatedProcedure
    .input(dashboardSeriesInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getDashboardSeries(ctx, input))),
  orderStatusCounts: authenticatedProcedure
    .input(dashboardSummaryInputSchema)
    .query(async ({ ctx, input }) =>
      unwrap(await getDashboardOrderStatusCounts(ctx, input.workspaceId)),
    ),
  topProducts: authenticatedProcedure
    .input(dashboardTopProductsInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getDashboardTopProducts(ctx, input))),
  operationsBoard: authenticatedProcedure
    .input(operationsBoardInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getOperationsBoard(ctx, input))),
  operationsBoardCounts: authenticatedProcedure
    .input(operationsBoardCountsInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getOperationsBoardCounts(ctx, input))),
});
