import type { Repositories } from "../../ports.ts";
import { key, after, takePage, toDeliveryDto } from "../store.ts";
import type { Store } from "../store.ts";

export const createDeliveryReads = (store: Store): Pick<Repositories, "deliveryReads"> => ({
  deliveryReads: {
    get: async (workspaceId, deliveryId) => {
      const delivery = store.deliveries.get(key(workspaceId, deliveryId));
      return delivery === undefined ? null : toDeliveryDto(delivery);
    },
    list: async ({ workspaceId, saleId, status, page }) => {
      const rows = [...store.deliveries.values()]
        .filter((row) => row.workspaceId === workspaceId)
        .filter((row) => saleId === null || row.saleId === saleId)
        .filter((row) => status === null || row.status === status)
        .sort((a, b) => {
          const aSort = `${a.transactionTime}|${a.recordedAt}`;
          const bSort = `${b.transactionTime}|${b.recordedAt}`;
          return aSort === bSort ? b.id.localeCompare(a.id) : bSort.localeCompare(aSort);
        })
        .filter((row) => {
          if (page.after === null) return true;
          const sort = `${row.transactionTime}|${row.recordedAt}`;
          return (
            sort < page.after.sortValue || (sort === page.after.sortValue && row.id < page.after.id)
          );
        });
      return takePage(rows.map(toDeliveryDto), page, (row) => ({
        sortValue: `${row.transactionTime}|${row.recordedAt}`,
        id: row.id,
      }));
    },
  },
});
