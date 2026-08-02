import type { PriceRuleDto, RecordPriceRuleCommand } from "@vuarau/domain-contracts";
import { recordPriceRuleCommandSchema } from "@vuarau/domain-contracts";
import { decideRecordPriceRule, err, ok } from "@vuarau/domain-kernel";
import type { DomainResult, PriceRuleState } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";

const dto = (rule: PriceRuleState): PriceRuleDto => ({
  id: rule.id,
  workspaceId: rule.workspaceId,
  productId: rule.productId,
  qualityGradeId: rule.qualityGradeId,
  customerId: rule.customerId,
  unit: rule.unit,
  kind: rule.kind,
  priority: rule.priority,
  minimumQuantityScaled: rule.minimumQuantityScaled,
  effectiveFrom: rule.effectiveFrom,
  effectiveTo: rule.effectiveTo,
  baseUnitPrice: rule.baseUnitPrice,
  discountPerUnit: rule.discountPerUnit,
  feePerUnit: rule.feePerUnit,
  finalUnitPrice: rule.finalUnitPrice,
  reason: rule.reason,
  actorId: rule.actorId,
  commandId: rule.commandId,
  recordedAt: rule.recordedAt,
});

export function recordPriceRule(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<PriceRuleDto>> {
  return runCommand<RecordPriceRuleCommand, PriceRuleDto>({
    commandType: "RecordPriceRule",
    schema: recordPriceRuleCommandSchema,
    input,
    ctx,
    requiredPermission: "pricing.manage",
    execute: async ({ command, repos, recordedAt }) => {
      if (
        (await repos.priceRules.findById(command.workspaceId, command.payload.priceRuleId)) !== null
      ) {
        return err("PRICING_RULE_INVALID", "Price rule identity already exists.");
      }
      if (
        (await repos.products.findById(command.workspaceId, command.payload.productId)) === null
      ) {
        return err("PRODUCT_NOT_FOUND", "No such product in this workspace.");
      }
      if (command.payload.qualityGradeId !== null) {
        if (
          (await repos.qualityGrades.findById(
            command.workspaceId,
            command.payload.qualityGradeId,
          )) === null
        ) {
          return err("QUALITY_GRADE_NOT_FOUND", "No such quality grade in this workspace.");
        }
      }
      if (command.payload.customerId !== null) {
        if (
          (await repos.customers.findById(command.workspaceId, command.payload.customerId)) === null
        ) {
          return err("CUSTOMER_NOT_FOUND", "No such customer in this workspace.");
        }
      }
      const decision = decideRecordPriceRule(command, recordedAt);
      if (!decision.ok) return decision;
      await repos.priceRules.insert(decision.value);
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "price_rule",
        aggregateId: decision.value.id,
        action: "price_rule.recorded",
        transactionTime: command.occurredAt,
        recordedAt,
        before: null,
        after: {
          productId: decision.value.productId,
          customerId: decision.value.customerId,
          finalUnitPriceMinor: decision.value.finalUnitPrice.amountMinor,
          currency: decision.value.finalUnitPrice.currency,
          effectiveFrom: decision.value.effectiveFrom,
          effectiveTo: decision.value.effectiveTo,
        },
        reason: decision.value.reason,
      });
      return ok(dto(decision.value));
    },
  });
}
