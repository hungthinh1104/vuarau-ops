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
    complete: async (workspaceId, idempotencyKey, result, change) => {
      const receiptKey = key(workspaceId, idempotencyKey);
      const existing = store.receipts.get(receiptKey);
      if (existing === undefined) throw new Error("Cannot complete an unknown command receipt.");
      const revision = (store.workspaceRevisions.get(workspaceId) ?? 0) + 1;
      const topics = change?.topics ?? ["workspace"];
      store.workspaceRevisions.set(workspaceId, revision);
      store.workspaceChanges.set(key(workspaceId, String(revision)), {
        workspaceId,
        revision,
        commandType: existing.commandType,
        topics,
        recordedAt: existing.recordedAt,
      });
      store.receipts.set(receiptKey, {
        ...existing,
        status: "completed",
        result,
        revision: String(revision),
      });
      return { revision: String(revision), topics };
    },
    changesSince: async (workspaceId, revision, limit) => {
      const since = Number(revision);
      if (!Number.isSafeInteger(since) || since < 0) {
        return {
          changes: [],
          nextRevision: String(store.workspaceRevisions.get(workspaceId) ?? 0),
        };
      }
      const changes = [...store.workspaceChanges.values()]
        .filter((change) => change.workspaceId === workspaceId && change.revision > since)
        .sort((left, right) => left.revision - right.revision)
        .slice(0, Math.min(Math.max(limit, 1), 200))
        .map(({ revision: position, commandType, topics, recordedAt }) => ({
          revision: String(position),
          commandType,
          topics: [...topics],
          recordedAt,
        }));
      return {
        changes,
        nextRevision: String(store.workspaceRevisions.get(workspaceId) ?? 0),
      };
    },
  },
});
