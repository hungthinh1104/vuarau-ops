import type { Repositories } from "../../ports.ts";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

export const createCostObservationRepositories = (
  store: Store,
): Pick<Repositories, "costObservations"> => ({
  costObservations: {
    findById: async (workspaceId, observationId) =>
      store.costObservations.get(key(workspaceId, observationId)) ?? null,
    insert: async (observation) => {
      const observationKey = key(observation.workspaceId, observation.id);
      if (store.costObservations.has(observationKey)) return false;
      store.costObservations.set(observationKey, observation);
      return true;
    },
  },
});
