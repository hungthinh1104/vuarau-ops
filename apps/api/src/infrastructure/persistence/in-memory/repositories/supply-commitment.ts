import type { Repositories } from "../../ports.ts";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

export const createSupplyCommitmentRepositories = (
  store: Store,
): Pick<Repositories, "supplyCommitments"> => ({
  supplyCommitments: {
    findById: async (workspaceId, id) => store.supplyCommitments.get(key(workspaceId, id)) ?? null,
    findByIdForUpdate: async (workspaceId, id) =>
      store.supplyCommitments.get(key(workspaceId, id)) ?? null,
    findReplacementOf: async (workspaceId, id) =>
      [...store.supplyCommitments.values()].find(
        (row) => row.workspaceId === workspaceId && row.replacesSupplyCommitmentId === id,
      ) ?? null,
    insert: async (commitment) => {
      if (store.supplyCommitments.has(key(commitment.workspaceId, commitment.id))) return false;
      if (
        commitment.replacesSupplyCommitmentId !== null &&
        [...store.supplyCommitments.values()].some(
          (row) =>
            row.workspaceId === commitment.workspaceId &&
            row.replacesSupplyCommitmentId === commitment.replacesSupplyCommitmentId,
        )
      )
        return false;
      store.supplyCommitments.set(key(commitment.workspaceId, commitment.id), commitment);
      return true;
    },
    updateDraft: async (commitment, expectedVersion) => {
      const current = store.supplyCommitments.get(key(commitment.workspaceId, commitment.id));
      if (current?.version !== expectedVersion || current.status !== "draft") return false;
      store.supplyCommitments.set(key(commitment.workspaceId, commitment.id), commitment);
      return true;
    },
    confirm: async (commitment, expectedVersion) => {
      const current = store.supplyCommitments.get(key(commitment.workspaceId, commitment.id));
      if (current?.version !== expectedVersion || current.status !== "draft") return false;
      store.supplyCommitments.set(key(commitment.workspaceId, commitment.id), commitment);
      return true;
    },
    cancel: async (commitment, expectedVersion) => {
      const current = store.supplyCommitments.get(key(commitment.workspaceId, commitment.id));
      if (current?.version !== expectedVersion || current.status === "cancelled") return false;
      store.supplyCommitments.set(key(commitment.workspaceId, commitment.id), commitment);
      return true;
    },
  },
});
