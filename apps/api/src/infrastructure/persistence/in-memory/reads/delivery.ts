import { recordDisplayReference } from "@vuarau/domain-contracts";
import type { Repositories } from "../../ports.ts";
import { fold, key, takePage, toDeliveryDto } from "../store.ts";
import type { Store } from "../store.ts";

export const createDeliveryReads = (store: Store): Pick<Repositories, "deliveryReads"> => ({
  deliveryReads: {
    get: async (workspaceId, deliveryId) => {
      const delivery = store.deliveries.get(key(workspaceId, deliveryId));
      return delivery === undefined ? null : toDeliveryDto(delivery);
    },
    list: async ({ workspaceId, saleId, status, query, page }) => {
      const needle = fold(query.trim());
      const rows = [...store.deliveries.values()]
        .filter((row) => row.workspaceId === workspaceId)
        .filter((row) => saleId === null || row.saleId === saleId)
        .filter((row) => status === null || row.status === status)
        .filter((row) => {
          if (needle.length === 0) return true;
          const referenceNeedle = needle.replace(/^[a-z]{2,4}-/, "");
          const sale = store.sales.get(key(workspaceId, row.saleId));
          const customer =
            sale === undefined ? null : store.customers.get(key(workspaceId, sale.customerId));
          return (
            fold(row.id).includes(referenceNeedle) ||
            fold(row.saleId).includes(referenceNeedle) ||
            fold(customer?.displayName ?? "").includes(needle) ||
            row.lines.some((line) => fold(line.productName).includes(needle))
          );
        })
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
      return takePage(
        rows.map((row) => {
          const sale = store.sales.get(key(workspaceId, row.saleId));
          const customer =
            sale === undefined ? null : store.customers.get(key(workspaceId, sale.customerId));
          const dto = toDeliveryDto(row);
          return {
            ...dto,
            displayReference: recordDisplayReference("delivery", row.id),
            saleDisplayReference: recordDisplayReference("sale", row.saleId),
            customerDisplayName: customer?.displayName ?? null,
            primaryProductName: dto.lines[0]?.productName ?? null,
            lineCount: dto.lines.length,
          };
        }),
        page,
        (row) => ({
          sortValue: `${row.transactionTime}|${row.recordedAt}`,
          id: row.id,
        }),
      );
    },
  },
});
