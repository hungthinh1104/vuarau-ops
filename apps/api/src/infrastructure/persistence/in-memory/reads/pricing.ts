import type { PriceRuleListInput, ResolvePriceInput } from "@vuarau/domain-contracts";
import type { Repositories } from "../../ports.ts";
import { takePage } from "../store.ts";
import type { Store } from "../store.ts";

export const createPriceRuleReads = (store: Store): Pick<Repositories, "priceRuleReads"> => ({
  priceRuleReads: {
    list: async (
      input: PriceRuleListInput & { readonly after: { sortValue: string; id: string } | null },
    ) => {
      const rows = [...store.priceRules.values()]
        .filter((rule) => rule.workspaceId === input.workspaceId)
        .filter((rule) => input.productId === null || rule.productId === input.productId)
        .filter(
          (rule) => input.qualityGradeId === null || rule.qualityGradeId === input.qualityGradeId,
        )
        .filter((rule) => input.customerId === null || rule.customerId === input.customerId)
        .filter((rule) => input.unit === null || rule.unit === input.unit)
        .sort((left, right) =>
          left.effectiveFrom === right.effectiveFrom
            ? left.id.localeCompare(right.id)
            : left.effectiveFrom.localeCompare(right.effectiveFrom),
        )
        .filter((rule) =>
          input.after === null
            ? true
            : rule.effectiveFrom > input.after.sortValue ||
              (rule.effectiveFrom === input.after.sortValue && rule.id > input.after.id),
        );
      return takePage(rows, input, (row) => ({ sortValue: row.effectiveFrom, id: row.id }));
    },
    forResolution: async (input: ResolvePriceInput) =>
      [...store.priceRules.values()].filter(
        (rule) =>
          rule.workspaceId === input.workspaceId &&
          rule.productId === input.productId &&
          rule.qualityGradeId === input.qualityGradeId &&
          rule.unit === input.unit &&
          (rule.customerId === null || rule.customerId === input.customerId),
      ),
  },
});
