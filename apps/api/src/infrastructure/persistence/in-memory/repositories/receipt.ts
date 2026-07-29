import type { Repositories } from "../../ports.ts";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

export const createReceiptRepositories = (store: Store): Pick<Repositories, "receipts"> => ({
  receipts: {
    find: async (workspaceId, idempotencyKey) =>
      store.receipts.get(key(workspaceId, idempotencyKey)) ?? null,
    findByCommandId: async (workspaceId, commandId) =>
      [...store.receipts.values()].find(
        (receipt) => receipt.workspaceId === workspaceId && receipt.commandId === commandId,
      ) ?? null,
    claim: async (receipt) => {
      const receiptKey = key(receipt.workspaceId, receipt.idempotencyKey);
      if (store.receipts.has(receiptKey)) {
        return false;
      }
      store.receipts.set(receiptKey, receipt);
      return true;
    },
    complete: async (workspaceId, idempotencyKey, result) => {
      const receiptKey = key(workspaceId, idempotencyKey);
      const existing = store.receipts.get(receiptKey);
      if (existing !== undefined) {
        store.receipts.set(receiptKey, { ...existing, status: "completed", result });
      }
    },
  },
});
