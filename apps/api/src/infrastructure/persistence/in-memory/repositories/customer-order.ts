import type { Repositories } from "../../ports.ts";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

export const createCustomerOrderRepositories = (
  store: Store,
): Pick<Repositories, "customerOrders"> => ({
  customerOrders: {
    findById: async (workspaceId, customerOrderId) =>
      store.customerOrders.get(key(workspaceId, customerOrderId)) ?? null,
    findByIdForUpdate: async (workspaceId, customerOrderId) =>
      store.customerOrders.get(key(workspaceId, customerOrderId)) ?? null,
    findReplacementOf: async (workspaceId, customerOrderId) =>
      [...store.customerOrders.values()].find(
        (order) =>
          order.workspaceId === workspaceId && order.replacesCustomerOrderId === customerOrderId,
      ) ?? null,
    insert: async (order) => {
      if (store.customerOrders.has(key(order.workspaceId, order.id))) return false;
      if (
        order.replacesCustomerOrderId !== null &&
        [...store.customerOrders.values()].some(
          (existing) =>
            existing.workspaceId === order.workspaceId &&
            existing.replacesCustomerOrderId === order.replacesCustomerOrderId,
        )
      )
        return false;
      store.customerOrders.set(key(order.workspaceId, order.id), order);
      return true;
    },
    updateDraft: async (order, expectedVersion) => {
      const current = store.customerOrders.get(key(order.workspaceId, order.id));
      if (
        current === undefined ||
        current.version !== expectedVersion ||
        current.status !== "draft"
      )
        return false;
      store.customerOrders.set(key(order.workspaceId, order.id), order);
      return true;
    },
    confirm: async (order, expectedVersion) => {
      const current = store.customerOrders.get(key(order.workspaceId, order.id));
      if (
        current === undefined ||
        current.version !== expectedVersion ||
        current.status !== "draft"
      )
        return false;
      store.customerOrders.set(key(order.workspaceId, order.id), order);
      return true;
    },
    cancel: async (order, expectedVersion) => {
      const current = store.customerOrders.get(key(order.workspaceId, order.id));
      if (
        current === undefined ||
        current.version !== expectedVersion ||
        current.status === "cancelled"
      )
        return false;
      store.customerOrders.set(key(order.workspaceId, order.id), order);
      return true;
    },
  },
});
