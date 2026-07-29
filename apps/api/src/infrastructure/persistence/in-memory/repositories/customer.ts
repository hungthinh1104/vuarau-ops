import type { Repositories } from "../../ports.ts";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

export const createCustomerRepositories = (store: Store): Pick<Repositories, "customers"> => ({
  customers: {
    findById: async (workspaceId, customerId) =>
      store.customers.get(key(workspaceId, customerId)) ?? null,
    findByIdForUpdate: async (workspaceId, customerId) =>
      store.customers.get(key(workspaceId, customerId)) ?? null,
    insert: async (customer) => {
      store.customers.set(key(customer.workspaceId, customer.id), customer);
    },
    update: async (customer, expectedVersion) => {
      const current = store.customers.get(key(customer.workspaceId, customer.id));
      if (current === undefined || current.version !== expectedVersion) {
        return false;
      }
      store.customers.set(key(customer.workspaceId, customer.id), customer);
      return true;
    },
  },
});
