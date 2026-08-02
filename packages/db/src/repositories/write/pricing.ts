import type { PriceRuleId, WorkspaceId } from "@vuarau/domain-contracts";
import type { PriceRuleState } from "@vuarau/domain-kernel";
import { and, eq } from "drizzle-orm";
import { priceRules } from "../../schema/index.ts";
import { fromIso, fromIsoOrNull } from "../row-mappers.ts";
import { toPriceRuleState } from "../shared/write-helpers.ts";
import type { Tx } from "../shared/types.ts";

export const createPriceRuleWriteRepositories = (tx: Tx) => ({
  priceRules: {
    async findById(
      workspaceId: WorkspaceId,
      priceRuleId: PriceRuleId,
    ): Promise<PriceRuleState | null> {
      const rows = await tx
        .select()
        .from(priceRules)
        .where(and(eq(priceRules.workspaceId, workspaceId), eq(priceRules.id, priceRuleId)))
        .limit(1);
      return rows[0] === undefined ? null : toPriceRuleState(rows[0]);
    },
    async insert(rule: PriceRuleState): Promise<void> {
      await tx.insert(priceRules).values({
        id: rule.id,
        workspaceId: rule.workspaceId,
        productId: rule.productId,
        qualityGradeId: rule.qualityGradeId,
        customerId: rule.customerId,
        unit: rule.unit,
        kind: rule.kind,
        priority: rule.priority,
        minimumQuantityScaled: rule.minimumQuantityScaled,
        effectiveFrom: fromIso(rule.effectiveFrom),
        effectiveTo: fromIsoOrNull(rule.effectiveTo),
        baseUnitPriceMinor: rule.baseUnitPrice.amountMinor,
        discountPerUnitMinor: rule.discountPerUnit.amountMinor,
        feePerUnitMinor: rule.feePerUnit.amountMinor,
        finalUnitPriceMinor: rule.finalUnitPrice.amountMinor,
        currency: rule.baseUnitPrice.currency,
        reason: rule.reason,
        actorId: rule.actorId,
        commandId: rule.commandId,
        recordedAt: fromIso(rule.recordedAt),
      });
    },
  },
});
