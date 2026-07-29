import type { Repositories } from "../../ports.ts";
import { key, takePage } from "../store.ts";
import type { Store } from "../store.ts";

export const createInventoryReads = (store: Store): Pick<Repositories, "inventoryReads"> => ({
  inventoryReads: {
    receipt: async (workspaceId, receiptId) => {
      const row = store.purchaseReceipts.get(key(workspaceId, receiptId));
      return row === undefined
        ? null
        : {
            ...row,
            lines: row.lines.map((line) => ({ ...line })),
            reversal:
              row.reversal === null
                ? null
                : {
                    id: row.reversal.id,
                    reasonCode: row.reversal.reasonCode,
                    reason: row.reversal.reason,
                    transactionTime: row.reversal.transactionTime,
                    recordedAt: row.reversal.recordedAt,
                  },
          };
    },
    receipts: async (workspaceId, purchaseId) =>
      [...store.purchaseReceipts.values()]
        .filter((row) => row.workspaceId === workspaceId && row.purchaseId === purchaseId)
        .map((row) => ({
          ...row,
          lines: row.lines.map((line) => ({ ...line })),
          reversal:
            row.reversal === null
              ? null
              : {
                  id: row.reversal.id,
                  reasonCode: row.reversal.reasonCode,
                  reason: row.reversal.reason,
                  transactionTime: row.reversal.transactionTime,
                  recordedAt: row.reversal.recordedAt,
                },
        })),
    adjustment: async (workspaceId, adjustmentId) => {
      const row = store.inventoryMovements.find(
        (movement) =>
          movement.workspaceId === workspaceId &&
          movement.sourceType === "inventory_adjustment" &&
          movement.sourceId === adjustmentId,
      );
      return row === undefined
        ? null
        : {
            ...row,
            sourceDocument: { type: "inventory_adjustment" as const, id: row.sourceId },
          };
    },
    balances: async (workspaceId, productId) =>
      [...store.inventoryBalances.values()]
        .filter((row) => row.workspaceId === workspaceId && row.productId === productId)
        .map((row) => ({
          ...row,
          classification:
            row.quantityScaled > 0
              ? ("positive" as const)
              : row.quantityScaled < 0
                ? ("negative" as const)
                : ("zero" as const),
        })),
    timeline: async ({ workspaceId, productId, unit, page }) => {
      const rows = store.inventoryMovements
        .filter(
          (row) =>
            row.workspaceId === workspaceId &&
            row.productId === productId &&
            (unit === null || row.quantity.unit === unit),
        )
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
          ...row,
          sourceDocument:
            row.sourceType === "inventory_adjustment"
              ? { type: "inventory_adjustment" as const, id: row.sourceId }
              : row.sourceType === "delivery_dispatch"
                ? { type: "delivery" as const, id: row.sourceId }
                : row.sourceType === "delivery_return"
                  ? {
                      type: "delivery" as const,
                      id:
                        store.deliveryReturns.find((returned) => returned.id === row.sourceId)
                          ?.deliveryId ?? row.sourceId,
                    }
                  : {
                      type: "receipt" as const,
                      id:
                        row.sourceType === "purchase_receipt"
                          ? row.sourceId
                          : ([...store.purchaseReceipts.values()].find(
                              (receipt) => receipt.reversal?.id === row.sourceId,
                            )?.id ?? row.sourceId),
                    },
        })),
        page,
        (row) => ({
          sortValue: `${row.transactionTime}|${row.recordedAt}`,
          id: row.id,
        }),
      );
    },
    integrity: async (workspaceId, productId, unit) => {
      const diagnostics: string[] = [];
      for (const movement of store.inventoryMovements.filter(
        (row) =>
          row.workspaceId === workspaceId &&
          row.productId === productId &&
          row.quantity.unit === unit,
      )) {
        if (movement.quantity.valueScaled === 0) diagnostics.push("zero_quantity");
        if (
          movement.sourceType === "inventory_adjustment" &&
          (movement.reasonCode === null || (movement.reason ?? "").trim().length === 0)
        )
          diagnostics.push("malformed_adjustment");
        if (movement.sourceType === "purchase_receipt") {
          const receipt = store.purchaseReceipts.get(key(workspaceId, movement.sourceId));
          const line = receipt?.lines.find((item) => item.receiptLineId === movement.sourceLineId);
          if (
            line === undefined ||
            line.productId !== productId ||
            line.quantity.unit !== unit ||
            line.quantity.valueScaled !== movement.quantity.valueScaled
          )
            diagnostics.push("missing_or_mismatched_receipt");
        }
        if (movement.sourceType === "delivery_dispatch") {
          const delivery = store.deliveries.get(key(workspaceId, movement.sourceId));
          const line = delivery?.lines.find(
            (item) => item.deliveryLineId === movement.sourceLineId,
          );
          if (
            line === undefined ||
            line.productId !== productId ||
            line.quantity.unit !== unit ||
            -line.quantity.valueScaled !== movement.quantity.valueScaled
          )
            diagnostics.push("missing_or_mismatched_delivery_dispatch");
        }
        if (movement.sourceType === "delivery_return") {
          const returned = store.deliveryReturns.find(
            (item) => item.workspaceId === workspaceId && item.id === movement.sourceId,
          );
          const returnLine = returned?.lines.find(
            (item) => item.deliveryLineId === movement.sourceLineId,
          );
          const delivery = returned
            ? store.deliveries.get(key(workspaceId, returned.deliveryId))
            : undefined;
          const deliveryLine = delivery?.lines.find(
            (item) => item.deliveryLineId === returnLine?.deliveryLineId,
          );
          const original = store.inventoryMovements.find(
            (item) => item.id === movement.reversalOfMovementId,
          );
          if (
            returnLine === undefined ||
            deliveryLine === undefined ||
            deliveryLine.productId !== productId ||
            returnLine.quantity.unit !== unit ||
            returnLine.quantity.valueScaled !== movement.quantity.valueScaled ||
            original?.sourceType !== "delivery_dispatch" ||
            original.sourceId !== returned?.deliveryId ||
            original.sourceLineId !== returnLine.deliveryLineId
          )
            diagnostics.push("broken_delivery_return");
        }
      }
      return diagnostics;
    },
  },
});
