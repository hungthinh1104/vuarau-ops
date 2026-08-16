import type { Repositories } from "../../ports.ts";
import type { Store } from "../store.ts";
import { key } from "../store.ts";

export const createCustomerPaymentCreditPreservationRepositories = (
  store: Store,
): Pick<Repositories, "customerPaymentCreditPreservations"> => ({
  customerPaymentCreditPreservations: {
    findByIdForUpdate: async (workspaceId, preservationId) =>
      store.customerPaymentCreditPreservations.get(key(workspaceId, preservationId)) ?? null,
    findCorrectionByTarget: async (workspaceId, preservationId) =>
      [...store.customerPaymentCreditPreservations.values()].find(
        (preservation) =>
          preservation.workspaceId === workspaceId &&
          preservation.relatedPreservationId === preservationId,
      ) ?? null,
    listByPayment: async (workspaceId, paymentId) =>
      [...store.customerPaymentCreditPreservations.values()].filter(
        (preservation) =>
          preservation.workspaceId === workspaceId && preservation.paymentId === paymentId,
      ),
    insert: async (preservation) => {
      const preservationKey = key(preservation.workspaceId, preservation.id);
      if (store.customerPaymentCreditPreservations.has(preservationKey)) return false;
      store.customerPaymentCreditPreservations.set(preservationKey, preservation);
      return true;
    },
  },
});
