import type { Repositories } from "../../ports.ts";
import { key, takePage } from "../store.ts";
import type { Store } from "../store.ts";

export const createCustomerOrderReads = (
  store: Store,
): Pick<Repositories, "customerOrderReads"> => ({
  customerOrderReads: {
    get: async (workspaceId, customerOrderId) =>
      store.customerOrders.get(key(workspaceId, customerOrderId)) ?? null,
    list: async ({ workspaceId, customerId, status, channel, page }) => {
      const rows = [...store.customerOrders.values()]
        .filter((order) => order.workspaceId === workspaceId)
        .filter((order) => customerId === null || order.customerId === customerId)
        .filter((order) => status === null || order.status === status)
        .filter((order) => channel === undefined || channel === null || order.channel === channel)
        .sort(
          (left, right) =>
            right.transactionTime.localeCompare(left.transactionTime) ||
            right.recordedAt.localeCompare(left.recordedAt) ||
            right.id.localeCompare(left.id),
        )
        .filter((order) => {
          if (page.after === null) return true;
          const sort = `${order.transactionTime}|${order.recordedAt}`;
          return (
            sort < page.after.sortValue ||
            (sort === page.after.sortValue && order.id < page.after.id)
          );
        });
      return takePage(rows, page, (row) => ({
        sortValue: `${row.transactionTime}|${row.recordedAt}`,
        id: row.id,
      }));
    },
  },
});
