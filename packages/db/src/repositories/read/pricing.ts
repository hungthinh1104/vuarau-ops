import { and, asc, eq, gt, isNull, or } from "drizzle-orm";
import type { PriceRuleListInput, ResolvePriceInput } from "@vuarau/domain-contracts";
import { priceRules } from "../../schema/index.ts";
import { toPriceRuleState } from "../shared/write-helpers.ts";
import { fetchLimit, paged } from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";

export const createPriceRuleReadRepositories = (tx: Tx) => ({
  priceRuleReads: {
    async list(
      input: PriceRuleListInput & { readonly after: { sortValue: string; id: string } | null },
    ) {
      const filters = [eq(priceRules.workspaceId, input.workspaceId)];
      if (input.productId !== null) filters.push(eq(priceRules.productId, input.productId));
      if (input.qualityGradeId !== null) {
        filters.push(eq(priceRules.qualityGradeId, input.qualityGradeId));
      }
      if (input.customerId !== null) filters.push(eq(priceRules.customerId, input.customerId));
      if (input.unit !== null) filters.push(eq(priceRules.unit, input.unit));
      if (input.after !== null) {
        filters.push(
          or(
            gt(priceRules.effectiveFrom, new Date(input.after.sortValue)),
            and(
              eq(priceRules.effectiveFrom, new Date(input.after.sortValue)),
              gt(priceRules.id, input.after.id),
            ),
          )!,
        );
      }
      const rows = await tx
        .select()
        .from(priceRules)
        .where(and(...filters))
        .orderBy(asc(priceRules.effectiveFrom), asc(priceRules.id))
        .limit(fetchLimit(input));
      return paged(rows.map(toPriceRuleState), input, (row) => ({
        sortValue: row.effectiveFrom,
        id: row.id,
      }));
    },
    async forResolution(input: ResolvePriceInput) {
      const rows = await tx
        .select()
        .from(priceRules)
        .where(
          and(
            eq(priceRules.workspaceId, input.workspaceId),
            eq(priceRules.productId, input.productId),
            input.qualityGradeId === null
              ? isNull(priceRules.qualityGradeId)
              : eq(priceRules.qualityGradeId, input.qualityGradeId),
            eq(priceRules.unit, input.unit),
            input.customerId === null
              ? isNull(priceRules.customerId)
              : or(isNull(priceRules.customerId), eq(priceRules.customerId, input.customerId)),
          ),
        );
      return rows.map(toPriceRuleState);
    },
  },
});
