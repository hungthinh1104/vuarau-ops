import type { CustomerOrderId, CustomerOrderStatus, CustomerId } from "@vuarau/domain-contracts";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { customerOrderLines, customerOrders } from "../../schema/index.ts";
import { fetchLimit, paged } from "../shared/read-helpers.ts";
import { loadCustomerOrder, mapCustomerOrderRows } from "../shared/customer-order-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createCustomerOrderReadRepositories = (tx: Tx) => ({
  customerOrderReads: {
    get: (workspaceId: string, customerOrderId: CustomerOrderId) =>
      loadCustomerOrder(tx, workspaceId, customerOrderId),
    async list(args: {
      workspaceId: string;
      customerId: CustomerId | null;
      status: CustomerOrderStatus | null;
      channel?: "account_customer" | "walk_in" | "contract_customer" | "internal_transfer" | null;
      page: { after: { sortValue: string; id: string } | null; limit: number };
    }) {
      const filters = [eq(customerOrders.workspaceId, args.workspaceId)];
      if (args.customerId !== null) filters.push(eq(customerOrders.customerId, args.customerId));
      if (args.status !== null) filters.push(eq(customerOrders.status, args.status));
      if (args.channel !== undefined && args.channel !== null)
        filters.push(eq(customerOrders.channel, args.channel));
      if (args.page.after !== null) {
        const [transactionTime, recordedAt] = args.page.after.sortValue.split("|");
        filters.push(sql`(${customerOrders.transactionTime}, ${customerOrders.recordedAt}, ${customerOrders.id})
          < (${transactionTime}::timestamptz, ${recordedAt}::timestamptz, ${args.page.after.id}::uuid)`);
      }
      const rows = await tx
        .select()
        .from(customerOrders)
        .where(and(...filters))
        .orderBy(
          desc(customerOrders.transactionTime),
          desc(customerOrders.recordedAt),
          desc(customerOrders.id),
        )
        .limit(fetchLimit(args.page));
      const ids = rows.map((row) => row.id);
      const lines =
        ids.length === 0
          ? []
          : await tx
              .select()
              .from(customerOrderLines)
              .where(
                and(
                  eq(customerOrderLines.workspaceId, args.workspaceId),
                  inArray(customerOrderLines.customerOrderId, ids),
                ),
              );
      const mapped = mapCustomerOrderRows(rows, lines);
      return paged(mapped, args.page, (row) => ({
        sortValue: `${row.transactionTime}|${row.recordedAt}`,
        id: row.id,
      }));
    },
  },
});
