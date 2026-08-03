import type { Repositories } from "../../ports.ts";
import type { Store } from "../store.ts";
import { key } from "../store.ts";

export const createSupplierObservationRepositories = (
  store: Store,
): Pick<Repositories, "supplierObservations"> => ({
  supplierObservations: {
    findById: async (workspaceId, observationId) =>
      store.supplierObservations.get(key(workspaceId, observationId)) ?? null,
    insert: async (observation) => {
      const observationKey = key(observation.workspaceId, observation.id);
      if (store.supplierObservations.has(observationKey)) return false;
      store.supplierObservations.set(observationKey, observation);
      return true;
    },
  },
});
