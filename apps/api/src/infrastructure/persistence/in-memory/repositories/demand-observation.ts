import type { Repositories } from "../../ports.ts";
import type { Store } from "../store.ts";
import { key } from "../store.ts";

export const createDemandObservationRepositories = (
  store: Store,
): Pick<Repositories, "demandObservations"> => ({
  demandObservations: {
    findById: async (workspaceId, observationId) =>
      store.demandObservations.get(key(workspaceId, observationId)) ?? null,
    insert: async (observation) => {
      const observationKey = key(observation.workspaceId, observation.id);
      if (store.demandObservations.has(observationKey)) return false;
      store.demandObservations.set(observationKey, observation);
      return true;
    },
  },
});
