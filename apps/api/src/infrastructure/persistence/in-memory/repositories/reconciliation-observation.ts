import type { Repositories } from "../../ports.ts";
import type { Store } from "../store.ts";
import { key } from "../store.ts";

export const createReconciliationObservationRepositories = (
  store: Store,
): Pick<Repositories, "reconciliationObservations"> => ({
  reconciliationObservations: {
    findById: async (workspaceId, observationId) =>
      store.reconciliationObservations.get(key(workspaceId, observationId)) ?? null,
    findByIdForUpdate: async (workspaceId, observationId) =>
      store.reconciliationObservations.get(key(workspaceId, observationId)) ?? null,
    findCorrectionByTarget: async (workspaceId, observationId) =>
      [...store.reconciliationObservations.values()].find(
        (observation) =>
          observation.workspaceId === workspaceId &&
          observation.relatedObservationId === observationId,
      ) ?? null,
    insert: async (observation) => {
      const observationKey = key(observation.workspaceId, observation.id);
      if (store.reconciliationObservations.has(observationKey)) return false;
      store.reconciliationObservations.set(observationKey, observation);
      return true;
    },
  },
});
