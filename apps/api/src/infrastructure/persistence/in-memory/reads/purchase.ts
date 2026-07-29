import type { Repositories } from "../../ports.ts";
import { key, after, takePage, toPurchaseDto } from "../store.ts";
import type { Store } from "../store.ts";

export const createPurchaseReads = (store: Store): Pick<Repositories, "purchaseReads"> => ({
  purchaseReads: {
    get: async (workspaceId, purchaseId) =>
      (() => {
        const row = store.purchases.get(key(workspaceId, purchaseId));
        return row === undefined ? null : toPurchaseDto(row);
      })(),
    list: async ({ workspaceId, supplierId, status, page }) => {
      const rows = [...store.purchases.values()]
        .filter((row) => row.workspaceId === workspaceId)
        .filter((row) => supplierId === null || row.supplierId === supplierId)
        .filter((row) => status === null || row.status === status)
        .sort((a, b) =>
          a.transactionTime !== b.transactionTime
            ? b.transactionTime.localeCompare(a.transactionTime)
            : a.recordedAt !== b.recordedAt
              ? b.recordedAt.localeCompare(a.recordedAt)
              : b.id.localeCompare(a.id),
        )
        .filter((row) => {
          if (page.after === null) return true;
          const sort = `${row.transactionTime}|${row.recordedAt}`;
          return (
            sort < page.after.sortValue || (sort === page.after.sortValue && row.id < page.after.id)
          );
        });
      return takePage(rows.map(toPurchaseDto), page, (row) => ({
        sortValue: `${row.transactionTime}|${row.recordedAt}`,
        id: row.id,
      }));
    },
  },
});
