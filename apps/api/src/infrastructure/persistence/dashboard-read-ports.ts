import type {
  DashboardOrderStatusCountsDto,
  DashboardSeriesDto,
  DashboardSummaryDto,
  DashboardTopProductsDto,
  OperationsBoardDto,
  OperationsBoardCountsDto,
  OperationsBoardCountsInput,
  OperationsBoardInput,
  DashboardSeriesInput,
  DashboardTopProductsInput,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import type { PageQuery } from "./read-ports.ts";

export type DashboardReadRepository = {
  summary(workspaceId: WorkspaceId): Promise<DashboardSummaryDto>;
  salesSeries(input: DashboardSeriesInput): Promise<DashboardSeriesDto>;
  orderStatusCounts(workspaceId: WorkspaceId): Promise<DashboardOrderStatusCountsDto>;
  topProducts(input: DashboardTopProductsInput): Promise<DashboardTopProductsDto>;
  operationsBoard(
    input: OperationsBoardInput & { readonly page: PageQuery; readonly now: string },
  ): Promise<OperationsBoardDto>;
  operationsBoardCounts(
    input: OperationsBoardCountsInput & { readonly now: string },
  ): Promise<OperationsBoardCountsDto>;
};
