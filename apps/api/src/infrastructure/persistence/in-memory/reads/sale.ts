import type { Repositories } from "../../ports.ts";
import type { SaleId, Money } from "@vuarau/domain-contracts";
import { key, descendingBy, before, takePage, fold } from "../store.ts";
import type { Store } from "../store.ts";

export const createSaleReads = (store: Store): Pick<Repositories, "saleReads"> => ({
  saleReads: {
    get: async (workspaceId, saleId) => store.sales.get(key(workspaceId, saleId)) ?? null,

    replacedBy: async (workspaceId, saleId) =>
      [...store.sales.values()].find(
        (sale) => sale.workspaceId === workspaceId && sale.replacesSaleId === saleId,
      )?.id ?? null,

    list: async ({ workspaceId, customerId, status, voided, from, to, page }) => {
      const matched = [...store.sales.values()]
        .filter((sale) => sale.workspaceId === workspaceId)
        .filter((sale) => customerId === null || sale.customerId === customerId)
        .filter((sale) => status === null || sale.status === status)
        .filter((sale) => voided === null || (sale.voidRecord !== null) === voided)
        .filter((sale) => from === null || sale.transactionTime >= from)
        .filter((sale) => to === null || sale.transactionTime <= to)
        .sort(
          descendingBy(
            (sale) => sale.transactionTime,
            (sale) => sale.id,
          ),
        )
        .filter((sale) =>
          page.after === null
            ? true
            : before([sale.transactionTime, sale.id], [page.after.sortValue, page.after.id]),
        )
        .map((sale) => ({
          id: sale.id,
          workspaceId: sale.workspaceId,
          customerId: sale.customerId,
          customerDisplayName:
            store.customers.get(key(workspaceId, sale.customerId))?.displayName ?? "",
          status: sale.status,
          isVoided: sale.voidRecord !== null,
          totalAmount: sale.totalAmount,
          lineCount: sale.lines.length,
          version: sale.version,
          transactionTime: sale.transactionTime,
          recordedAt: sale.recordedAt,
          postedAt: sale.postedAt,
          discardedAt: sale.discardedAt,
          dueAt: sale.dueAt,
          replacesSaleId: sale.replacesSaleId,
          replacedBySaleId:
            [...store.sales.values()].find(
              (other) => other.workspaceId === workspaceId && other.replacesSaleId === sale.id,
            )?.id ?? null,
        }));

      return takePage(matched, page, (row) => ({
        sortValue: row.transactionTime,
        id: row.id,
      }));
    },

    captureContext: async ({ workspaceId, customerId, query, limit }) => {
      const needle = fold(query);
      const eligible = [...store.sales.values()]
        .filter(
          (sale) =>
            sale.workspaceId === workspaceId &&
            sale.status === "posted" &&
            sale.voidRecord === null,
        )
        .sort(
          descendingBy(
            (sale) => sale.transactionTime,
            (sale) => sale.id,
          ),
        );
      const customerHistory = [] as Array<{
        productName: string;
        unit: string;
        lastUnitPrice: Money;
        lastTransactionTime: string;
        sourceSaleId: SaleId;
      }>;
      const workspaceHistory = [] as Array<{ productName: string; unit: string }>;
      const customerSeen = new Set<string>();
      const workspaceSeen = new Set<string>();
      for (const sale of eligible)
        for (const line of sale.lines) {
          if (needle.length > 0 && !fold(line.productName).includes(needle)) continue;
          const identity = `${line.productName}\u0000${line.quantity.unit}`;
          if (!workspaceSeen.has(identity) && workspaceHistory.length < limit) {
            workspaceSeen.add(identity);
            workspaceHistory.push({ productName: line.productName, unit: line.quantity.unit });
          }
          if (
            sale.customerId === customerId &&
            !customerSeen.has(identity) &&
            customerHistory.length < limit
          ) {
            customerSeen.add(identity);
            customerHistory.push({
              productName: line.productName,
              unit: line.quantity.unit,
              lastUnitPrice: line.unitPrice,
              lastTransactionTime: sale.transactionTime,
              sourceSaleId: sale.id,
            });
          }
        }
      return { customerHistory, workspaceHistory };
    },
  },
});
