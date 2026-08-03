import type { Repositories } from "../../ports.ts";
import type { Store } from "../store.ts";
import { key } from "../store.ts";

export const createDebtObservationRepositories = (
  store: Store,
): Pick<Repositories, "debtObservations"> => ({
  debtObservations: {
    findById: async (workspaceId, observationId) =>
      store.debtObservations.get(key(workspaceId, observationId)) ?? null,
    insert: async (observation) => {
      const observationKey = key(observation.workspaceId, observation.id);
      if (store.debtObservations.has(observationKey)) return false;
      store.debtObservations.set(observationKey, observation);
      return true;
    },
  },
});
