import { recordDisplayReference } from "@vuarau/domain-contracts";
import type { Repositories } from "../../ports.ts";
import { fold, key, takePage, toPurchaseDto } from "../store.ts";
import type { Store } from "../store.ts";

export const createPurchaseReads = (store: Store): Pick<Repositories, "purchaseReads"> => ({
  purchaseReads: {
    get: async (workspaceId, purchaseId) =>
      (() => {
        const row = store.purchases.get(key(workspaceId, purchaseId));
        return row === undefined ? null : toPurchaseDto(row);
      })(),
    list: async ({ workspaceId, supplierId, status, query, page }) => {
      const needle = fold(query.trim());
      const rows = [...store.purchases.values()]
        .filter((row) => row.workspaceId === workspaceId)
        .filter((row) => supplierId === null || row.supplierId === supplierId)
        .filter((row) => status === null || row.status === status)
        .filter((row) => {
          if (needle.length === 0) return true;
          const referenceNeedle = needle.replace(/^[a-z]{2,4}-/, "");
          const supplier = store.suppliers.get(key(workspaceId, row.supplierId));
          return (
            fold(row.id).includes(referenceNeedle) ||
            fold(supplier?.displayName ?? "").includes(needle) ||
            row.lines.some((line) => fold(line.productName).includes(needle))
          );
        })
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
      return takePage(
        rows.map((row) => ({
          ...toPurchaseDto(row),
          displayReference: recordDisplayReference("purchase", row.id),
          supplierDisplayName:
            store.suppliers.get(key(workspaceId, row.supplierId))?.displayName ??
            "Không rõ nhà cung cấp",
          primaryProductName: row.lines[0]?.productName ?? null,
          lineCount: row.lines.length,
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
