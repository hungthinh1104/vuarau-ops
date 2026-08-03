import type { Repositories } from "../../ports.ts";
import type { Store } from "../store.ts";
import { key } from "../store.ts";

export const createReconciliationObservationRepositories = (
  store: Store,
): Pick<Repositories, "reconciliationObservations"> => ({
  reconciliationObservations: {
    findById: async (workspaceId, observationId) =>
      store.reconciliationObservations.get(key(workspaceId, observationId)) ?? null,
    insert: async (observation) => {
      const observationKey = key(observation.workspaceId, observation.id);
      if (store.reconciliationObservations.has(observationKey)) return false;
      store.reconciliationObservations.set(observationKey, observation);
      return true;
    },
  },
});
