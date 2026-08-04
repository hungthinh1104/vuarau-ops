import type { Repositories } from "../../ports.ts";
import type { Store } from "../store.ts";
import { key } from "../store.ts";

export const createSupplyCommitmentObservationRepositories = (
  store: Store,
): Pick<Repositories, "supplyCommitmentObservations"> => ({
  supplyCommitmentObservations: {
    findById: async (workspaceId, observationId) =>
      store.supplyCommitmentObservations.get(key(workspaceId, observationId)) ?? null,
    findByIdForUpdate: async (workspaceId, observationId) =>
      store.supplyCommitmentObservations.get(key(workspaceId, observationId)) ?? null,
    findCorrectionByTarget: async (workspaceId, observationId) =>
      [...store.supplyCommitmentObservations.values()].find(
        (observation) =>
          observation.workspaceId === workspaceId &&
          observation.relatedObservationId === observationId,
      ) ?? null,
    insert: async (observation) => {
      const observationKey = key(observation.workspaceId, observation.id);
      if (store.supplyCommitmentObservations.has(observationKey)) return false;
      store.supplyCommitmentObservations.set(observationKey, observation);
      return true;
    },
  },
});
