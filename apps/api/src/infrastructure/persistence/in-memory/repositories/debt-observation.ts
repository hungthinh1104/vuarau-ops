import type { Repositories } from "../../ports.ts";
import type { Store } from "../store.ts";
import { key } from "../store.ts";

export const createDebtObservationRepositories = (
  store: Store,
): Pick<Repositories, "debtObservations"> => ({
  debtObservations: {
    findById: async (workspaceId, observationId) =>
      store.debtObservations.get(key(workspaceId, observationId)) ?? null,
    findByIdForUpdate: async (workspaceId, observationId) =>
      store.debtObservations.get(key(workspaceId, observationId)) ?? null,
    findCorrectionByTarget: async (workspaceId, observationId) =>
      [...store.debtObservations.values()].find(
        (observation) =>
          observation.workspaceId === workspaceId &&
          observation.relatedObservationId === observationId,
      ) ?? null,
    listByPayment: async (workspaceId, paymentReference) =>
      [...store.debtObservations.values()].filter(
        (observation) =>
          observation.workspaceId === workspaceId &&
          observation.kind === "customer_credit_preserved" &&
          observation.facts.paymentReference === paymentReference,
      ),
    insert: async (observation) => {
      const observationKey = key(observation.workspaceId, observation.id);
      if (store.debtObservations.has(observationKey)) return false;
      store.debtObservations.set(observationKey, observation);
      return true;
    },
  },
});
