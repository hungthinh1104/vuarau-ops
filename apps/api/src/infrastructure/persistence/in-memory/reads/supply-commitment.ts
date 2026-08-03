import type { Repositories } from "../../ports.ts";
import { key, takePage } from "../store.ts";
import type { Store } from "../store.ts";

export const createSupplyCommitmentReads = (
  store: Store,
): Pick<Repositories, "supplyCommitmentReads"> => ({
  supplyCommitmentReads: {
    get: async (workspaceId, id) => store.supplyCommitments.get(key(workspaceId, id)) ?? null,
    list: async ({ workspaceId, supplierId, status, page }) => {
      const rows = [...store.supplyCommitments.values()]
        .filter((row) => row.workspaceId === workspaceId)
        .filter((row) => supplierId === null || row.supplierId === supplierId)
        .filter((row) => status === null || row.status === status)
        .sort(
          (left, right) =>
            right.transactionTime.localeCompare(left.transactionTime) ||
            right.recordedAt.localeCompare(left.recordedAt) ||
            right.id.localeCompare(left.id),
        )
        .filter((row) => {
          if (page.after === null) return true;
          const sort = `${row.transactionTime}|${row.recordedAt}`;
          return (
            sort < page.after.sortValue || (sort === page.after.sortValue && row.id < page.after.id)
          );
        });
      return takePage(rows, page, (row) => ({
        sortValue: `${row.transactionTime}|${row.recordedAt}`,
        id: row.id,
      }));
    },
  },
});
