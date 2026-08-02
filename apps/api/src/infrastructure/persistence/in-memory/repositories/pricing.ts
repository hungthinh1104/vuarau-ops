import type { Repositories } from "../../ports.ts";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

export const createPriceRuleRepositories = (store: Store): Pick<Repositories, "priceRules"> => ({
  priceRules: {
    findById: async (workspaceId, priceRuleId) =>
      store.priceRules.get(key(workspaceId, priceRuleId)) ?? null,
    insert: async (rule) => {
      store.priceRules.set(key(rule.workspaceId, rule.id), rule);
    },
  },
});
