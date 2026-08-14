import type { Repositories } from "../../ports.ts";
import type { Store } from "../store.ts";
import { key } from "../store.ts";

export const createDeliveryReturnSettlementRepositories = (
  store: Store,
): Pick<Repositories, "deliveryReturnSettlements"> => ({
  deliveryReturnSettlements: {
    findById: async (workspaceId, settlementId) =>
      store.deliveryReturnSettlements.get(key(workspaceId, settlementId)) ?? null,
    findByIdForUpdate: async (workspaceId, settlementId) =>
      store.deliveryReturnSettlements.get(key(workspaceId, settlementId)) ?? null,
    findCorrectionByTarget: async (workspaceId, settlementId) =>
      [...store.deliveryReturnSettlements.values()].find(
        (row) => row.workspaceId === workspaceId && row.relatedSettlementId === settlementId,
      ) ?? null,
    existsForReturn: async (workspaceId, returnId) =>
      [...store.deliveryReturnSettlements.values()].some(
        (row) => row.workspaceId === workspaceId && row.returnId === returnId,
      ),
    insert: async (settlement) => {
      const settlementKey = key(settlement.workspaceId, settlement.id);
      if (store.deliveryReturnSettlements.has(settlementKey)) return false;
      store.deliveryReturnSettlements.set(settlementKey, settlement);
      return true;
    },
  },
});
