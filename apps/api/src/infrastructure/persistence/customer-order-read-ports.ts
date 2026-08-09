import type {
  CustomerId,
  CustomerOrderChannel,
  CustomerOrderId,
  CustomerOrderStatus,
  CustomerOrderSummaryDto,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import type { CustomerOrderState } from "@vuarau/domain-kernel";
import type { PageQuery, PageResult } from "./read-ports.ts";

export type CustomerOrderReadRepository = {
  get(
    workspaceId: WorkspaceId,
    customerOrderId: CustomerOrderId,
  ): Promise<CustomerOrderState | null>;
  list(args: {
    workspaceId: WorkspaceId;
    customerId: CustomerId | null;
    status: CustomerOrderStatus | null;
    query: string;
    channel?: CustomerOrderChannel | null;
    page: PageQuery;
  }): Promise<PageResult<CustomerOrderSummaryDto>>;
};
