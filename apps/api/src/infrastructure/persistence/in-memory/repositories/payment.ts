import type { Repositories } from "../../ports.ts";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

export const createPaymentRepositories = (store: Store): Pick<Repositories, "payments"> => ({
  payments: {
    findByIdForUpdate: async (workspaceId, paymentId) =>
      store.payments.get(key(workspaceId, paymentId)) ?? null,
    insert: async (payment) => {
      store.payments.set(key(payment.workspaceId, payment.id), payment);
    },
    update: async (payment, expectedVersion) => {
      const current = store.payments.get(key(payment.workspaceId, payment.id));
      if (current === undefined || current.version !== expectedVersion) {
        return false;
      }
      store.payments.set(key(payment.workspaceId, payment.id), payment);
      return true;
    },
    insertReversal: async (reversal) => {
      store.reversals.push(reversal);
    },
  },
});
