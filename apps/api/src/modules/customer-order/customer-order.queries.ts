import type { CustomerOrderGetInput, CustomerOrderListInput } from "@vuarau/domain-contracts";
import { err } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";
import { toCustomerOrderDto } from "./customer-order.handlers.ts";

export function getCustomerOrder(ctx: CommandContext, input: CustomerOrderGetInput) {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "customer_order.read",
    execute: async ({ repos }) => {
      const order = await repos.customerOrderReads.get(input.workspaceId, input.customerOrderId);
      return order === null ? null : toCustomerOrderDto(order);
    },
  }).then((result) =>
    result.ok && result.value === null
      ? err("CUSTOMER_ORDER_NOT_FOUND", "No such Customer Order.")
      : result,
  );
}

export function listCustomerOrders(ctx: CommandContext, input: CustomerOrderListInput) {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "customer_order.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.customerOrderReads.list({
          workspaceId: input.workspaceId,
          customerId: input.customerId,
          status: input.status,
          page: toPageQuery(input),
        }),
        toCustomerOrderDto,
      ),
  });
}
