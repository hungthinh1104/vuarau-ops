import type { Repositories } from "../../ports.ts";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

export const createSaleRepositories = (store: Store): Pick<Repositories, "sales"> => ({
  sales: {
    findByIdForUpdate: async (workspaceId, saleId) =>
      store.sales.get(key(workspaceId, saleId)) ?? null,
    insert: async (sale) => {
      store.sales.set(key(sale.workspaceId, sale.id), sale);
    },
    // Conditional on the version *and* on the row still being a draft — the
    // same two conditions the Drizzle UPDATE carries, so an application test
    // cannot pass against semantics the database would refuse.
    post: async (sale, expectedVersion) => {
      const current = store.sales.get(key(sale.workspaceId, sale.id));
      if (
        current === undefined ||
        current.version !== expectedVersion ||
        current.status !== "draft"
      ) {
        return false;
      }
      store.sales.set(key(sale.workspaceId, sale.id), sale);
      return true;
    },
    // The same two conditions the Drizzle UPDATE carries — version *and*
    // still-a-draft — so an application test cannot pass against semantics
    // the database would refuse.
    updateDraft: async (sale, expectedVersion) => {
      const current = store.sales.get(key(sale.workspaceId, sale.id));
      if (
        current === undefined ||
        current.version !== expectedVersion ||
        current.status !== "draft"
      ) {
        return false;
      }
      store.sales.set(key(sale.workspaceId, sale.id), sale);
      return true;
    },
    insertVoid: async (record) => {
      // Mirrors UNIQUE (sale_id) in Postgres (BR-SALE-013). Without this the
      // in-memory adapter would accept a double void that the real database
      // refuses, and the concurrency test would prove nothing.
      if (store.saleVoids.some((existing) => existing.saleId === record.saleId)) {
        return false;
      }
      store.saleVoids.push(record);
      const sale = store.sales.get(key(record.workspaceId, record.saleId));
      if (sale !== undefined) {
        // The sale row itself is untouched; only the void it now has is
        // recorded, mirroring the join the Drizzle repository performs.
        store.sales.set(key(record.workspaceId, record.saleId), {
          ...sale,
          voidRecord: record,
        });
      }
      return true;
    },
  },
});
