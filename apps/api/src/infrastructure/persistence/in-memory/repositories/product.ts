import type { Repositories } from "../../ports.ts";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

export const createProductRepositories = (store: Store): Pick<Repositories, "products"> => ({
  products: {
    findById: async (workspaceId, productId) =>
      store.products.get(key(workspaceId, productId)) ?? null,
    findByIdForUpdate: async (workspaceId, productId) =>
      store.products.get(key(workspaceId, productId)) ?? null,
    insert: async (product) => {
      store.products.set(key(product.workspaceId, product.id), product);
    },
    update: async (product, expectedVersion) => {
      const current = store.products.get(key(product.workspaceId, product.id));
      if (current === undefined || current.version !== expectedVersion) return false;
      store.products.set(key(product.workspaceId, product.id), product);
      return true;
    },
  },
});
