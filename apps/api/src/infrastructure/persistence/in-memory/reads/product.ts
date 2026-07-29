import type { Repositories } from "../../ports.ts";
import { key, ascendingBy, after, takePage, fold } from "../store.ts";
import type { Store } from "../store.ts";

export const createProductReads = (store: Store): Pick<Repositories, "productReads"> => ({
  productReads: {
    search: async ({ workspaceId, query, isActive, page }) => {
      const needle = fold(query.trim());
      const rows = [...store.products.values()]
        .filter((product) => product.workspaceId === workspaceId)
        .filter((product) => isActive === null || product.isActive === isActive)
        .filter(
          (product) =>
            needle.length === 0 ||
            fold(product.displayName).includes(needle) ||
            product.aliases.some((alias) => fold(alias).includes(needle)),
        )
        .sort(
          ascendingBy(
            (product) => product.displayName,
            (product) => product.id,
          ),
        )
        .filter((product) =>
          page.after === null
            ? true
            : after([product.displayName, product.id], [page.after.sortValue, page.after.id]),
        );
      return takePage(
        rows.map((row) => ({ ...row, aliases: [...row.aliases] })),
        page,
        (row) => ({ sortValue: row.displayName, id: row.id }),
      );
    },
    get: async (workspaceId, productId) => {
      const row = store.products.get(key(workspaceId, productId));
      return row === undefined ? null : { ...row, aliases: [...row.aliases] };
    },
  },
});
