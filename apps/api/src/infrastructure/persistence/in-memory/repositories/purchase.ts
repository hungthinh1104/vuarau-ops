import type { Repositories } from "../../ports.ts";
import type { PurchaseReceiptReversalState } from "@vuarau/domain-kernel";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

export const createPurchaseRepositories = (
  store: Store,
): Pick<Repositories, "purchases" | "purchaseReceipts"> => ({
  purchases: {
    findById: async (workspaceId, purchaseId) =>
      store.purchases.get(key(workspaceId, purchaseId)) ?? null,
    findReplacementOf: async (workspaceId, purchaseId) =>
      [...store.purchases.values()].find(
        (purchase) =>
          purchase.workspaceId === workspaceId && purchase.replacesPurchaseId === purchaseId,
      ) ?? null,
    findByIdForUpdate: async (workspaceId, purchaseId) =>
      store.purchases.get(key(workspaceId, purchaseId)) ?? null,
    insert: async (purchase) => {
      if (
        store.purchases.has(key(purchase.workspaceId, purchase.id)) ||
        (purchase.replacesPurchaseId !== null &&
          [...store.purchases.values()].some(
            (existing) =>
              existing.workspaceId === purchase.workspaceId &&
              existing.replacesPurchaseId === purchase.replacesPurchaseId,
          ))
      )
        return false;
      store.purchases.set(key(purchase.workspaceId, purchase.id), purchase);
      return true;
    },
    updateDraft: async (purchase, expectedVersion) => {
      const current = store.purchases.get(key(purchase.workspaceId, purchase.id));
      if (
        current === undefined ||
        current.version !== expectedVersion ||
        current.status !== "draft"
      )
        return false;
      store.purchases.set(key(purchase.workspaceId, purchase.id), purchase);
      return true;
    },
    confirm: async (purchase, expectedVersion) => {
      const current = store.purchases.get(key(purchase.workspaceId, purchase.id));
      if (
        current === undefined ||
        current.version !== expectedVersion ||
        current.status !== "draft"
      )
        return false;
      store.purchases.set(key(purchase.workspaceId, purchase.id), purchase);
      return true;
    },
    insertVoid: async (record) => {
      if (
        store.purchaseVoids.some(
          (row) => row.workspaceId === record.workspaceId && row.purchaseId === record.purchaseId,
        )
      )
        return false;
      store.purchaseVoids.push(record);
      const current = store.purchases.get(key(record.workspaceId, record.purchaseId));
      if (current !== undefined) {
        store.purchases.set(key(record.workspaceId, record.purchaseId), {
          ...current,
          voidRecord: record,
        });
      }
      return true;
    },
  },
  purchaseReceipts: {
    findById: async (workspaceId, receiptId) =>
      store.purchaseReceipts.get(key(workspaceId, receiptId)) ?? null,
    insert: async (receipt) => {
      store.purchaseReceipts.set(key(receipt.workspaceId, receipt.id), receipt);
    },
    insertReversal: async (reversal: PurchaseReceiptReversalState) => {
      const receipt = store.purchaseReceipts.get(key(reversal.workspaceId, reversal.receiptId));
      if (receipt === undefined || receipt.reversal !== null) return false;
      store.purchaseReceipts.set(key(reversal.workspaceId, reversal.receiptId), {
        ...receipt,
        reversal,
      });
      return true;
    },
    netReceivedByPurchaseLine: async (workspaceId, purchaseId) => {
      const result = new Map<string, number>();
      for (const receipt of store.purchaseReceipts.values()) {
        if (
          receipt.workspaceId !== workspaceId ||
          receipt.purchaseId !== purchaseId ||
          receipt.reversal !== null
        )
          continue;
        for (const line of receipt.lines) {
          result.set(
            line.purchaseLineId,
            (result.get(line.purchaseLineId) ?? 0) + line.quantity.valueScaled,
          );
        }
      }
      return result;
    },
  },
});
