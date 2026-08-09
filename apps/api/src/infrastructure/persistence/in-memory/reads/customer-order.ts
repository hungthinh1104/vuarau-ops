import { recordDisplayReference } from "@vuarau/domain-contracts";
import { customerOrderCapabilities } from "@vuarau/domain-kernel";
import type { Repositories } from "../../ports.ts";
import { fold, key, takePage } from "../store.ts";
import type { Store } from "../store.ts";

export const createCustomerOrderReads = (
  store: Store,
): Pick<Repositories, "customerOrderReads"> => ({
  customerOrderReads: {
    get: async (workspaceId, customerOrderId) =>
      store.customerOrders.get(key(workspaceId, customerOrderId)) ?? null,
    list: async ({ workspaceId, customerId, status, query, channel, page }) => {
      const needle = fold(query.trim());
      const rows = [...store.customerOrders.values()]
        .filter((order) => order.workspaceId === workspaceId)
        .filter((order) => customerId === null || order.customerId === customerId)
        .filter((order) => status === null || order.status === status)
        .filter((order) => channel === undefined || channel === null || order.channel === channel)
        .filter((order) => {
          if (needle.length === 0) return true;
          const referenceNeedle = needle.replace(/^[a-z]{2,4}-/, "");
          const customer =
            order.customerId === null
              ? null
              : store.customers.get(key(workspaceId, order.customerId));
          return (
            fold(order.id).includes(referenceNeedle) ||
            fold(customer?.displayName ?? "").includes(needle) ||
            order.lines.some((line) => fold(line.productName).includes(needle))
          );
        })
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
      return takePage(
        rows.map((row) => ({
          ...row,
          evidenceReferences: [...row.evidenceReferences],
          lines: row.lines.map((line) => ({ ...line })),
          displayReference: recordDisplayReference("customerOrder", row.id),
          customerDisplayName:
            row.customerId === null
              ? null
              : (store.customers.get(key(workspaceId, row.customerId))?.displayName ?? null),
          primaryProductName: row.lines[0]?.productName ?? null,
          primaryQuantity: row.lines[0]?.quantity ?? null,
          lineCount: row.lines.length,
          capabilities: customerOrderCapabilities(row),
        })),
        page,
        (row) => ({
          sortValue: `${row.transactionTime}|${row.recordedAt}`,
          id: row.id,
        }),
      );
    },
  },
});
