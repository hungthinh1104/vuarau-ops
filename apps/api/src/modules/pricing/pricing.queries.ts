import type {
  Page,
  PriceResolutionDto,
  PriceRuleDto,
  PriceRuleListInput,
  ResolvePriceInput,
} from "@vuarau/domain-contracts";
import { resolvePriceRules, type DomainResult, type PriceRuleState } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";

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

export function listPriceRules(
  ctx: CommandContext,
  input: PriceRuleListInput,
): Promise<DomainResult<Page<PriceRuleDto>>> {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "pricing.read",
    execute: async ({ repos }) =>
      toPage(await repos.priceRuleReads.list({ ...input, ...toPageQuery(input) }), dto),
  });
}

export function resolvePrice(
  ctx: CommandContext,
  input: ResolvePriceInput,
): Promise<DomainResult<PriceResolutionDto>> {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "pricing.read",
    execute: async ({ repos }) => {
      const resolution = resolvePriceRules(await repos.priceRuleReads.forResolution(input), input);
      return {
        status: resolution.status,
        selected: resolution.selected === null ? null : dto(resolution.selected),
        candidates: resolution.candidates.map(dto),
      };
    },
  });
}
