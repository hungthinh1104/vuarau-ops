import type {
  IsoInstant,
  RecordPriceRuleCommand,
  ResolvePriceInput,
} from "@vuarau/domain-contracts";
import type { PriceRuleState } from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

function validMoney(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function decideRecordPriceRule(
  command: RecordPriceRuleCommand,
  recordedAt: IsoInstant,
): DomainResult<PriceRuleState> {
  const payload = command.payload;
  if (payload.kind === "list" && payload.customerId !== null) {
    return err("PRICING_RULE_INVALID", "A list price cannot be customer-specific.");
  }
  if (payload.kind === "customer" && payload.customerId === null) {
    return err("PRICING_RULE_INVALID", "A customer price requires a customer.");
  }
  if (payload.kind === "override" && (payload.reason === null || payload.reason.trim() === "")) {
    return err("PRICING_RULE_INVALID", "A price override requires a reason.");
  }
  if (
    payload.effectiveTo !== null &&
    Date.parse(payload.effectiveTo) <= Date.parse(payload.effectiveFrom)
  ) {
    return err("PRICING_RULE_INVALID", "Price rule effectiveTo must be after effectiveFrom.");
  }
  if (payload.baseUnitPrice.currency !== payload.discountPerUnit.currency) {
    return err("PRICING_RULE_INVALID", "Price adjustments must use the base price currency.");
  }
  if (payload.baseUnitPrice.currency !== payload.feePerUnit.currency) {
    return err("PRICING_RULE_INVALID", "Price adjustments must use the base price currency.");
  }
  if (
    !validMoney(payload.baseUnitPrice.amountMinor) ||
    !validMoney(payload.discountPerUnit.amountMinor) ||
    !validMoney(payload.feePerUnit.amountMinor) ||
    !Number.isSafeInteger(payload.priority) ||
    !Number.isSafeInteger(payload.minimumQuantityScaled)
  ) {
    return err(
      "PRICING_RULE_INVALID",
      "Price and adjustments must be non-negative exact integers.",
    );
  }

  const finalAmount =
    payload.baseUnitPrice.amountMinor -
    payload.discountPerUnit.amountMinor +
    payload.feePerUnit.amountMinor;
  if (!validMoney(finalAmount)) {
    return err("PRICING_RULE_INVALID", "Price adjustments cannot produce a negative price.");
  }

  return ok({
    id: payload.priceRuleId,
    workspaceId: command.workspaceId,
    productId: payload.productId,
    qualityGradeId: payload.qualityGradeId,
    customerId: payload.customerId,
    unit: payload.unit,
    kind: payload.kind,
    priority: payload.priority,
    minimumQuantityScaled: payload.minimumQuantityScaled,
    effectiveFrom: payload.effectiveFrom,
    effectiveTo: payload.effectiveTo,
    baseUnitPrice: payload.baseUnitPrice,
    discountPerUnit: payload.discountPerUnit,
    feePerUnit: payload.feePerUnit,
    finalUnitPrice: {
      amountMinor: finalAmount,
      currency: payload.baseUnitPrice.currency,
    },
    reason: payload.reason,
    actorId: command.actorId,
    commandId: command.commandId,
    recordedAt,
  });
}

function matches(rule: PriceRuleState, input: ResolvePriceInput): boolean {
  if (
    rule.productId !== input.productId ||
    rule.qualityGradeId !== input.qualityGradeId ||
    rule.unit !== input.unit ||
    rule.minimumQuantityScaled > input.quantity.valueScaled
  ) {
    return false;
  }
  if (rule.customerId !== null && rule.customerId !== input.customerId) return false;
  if (input.customerId === null && rule.customerId !== null) return false;
  const asOf = Date.parse(input.asOf);
  return (
    Date.parse(rule.effectiveFrom) <= asOf &&
    (rule.effectiveTo === null || asOf < Date.parse(rule.effectiveTo))
  );
}

function rank(rule: PriceRuleState): readonly [number, number, number] {
  return [rule.priority, rule.minimumQuantityScaled, Date.parse(rule.effectiveFrom)];
}

function sameRank(left: PriceRuleState, right: PriceRuleState): boolean {
  return rank(left).every((value, index) => value === rank(right)[index]);
}

export function resolvePriceRules(
  rules: readonly PriceRuleState[],
  input: ResolvePriceInput,
): {
  readonly status: "selected" | "none" | "ambiguous";
  readonly candidates: readonly PriceRuleState[];
  readonly selected: PriceRuleState | null;
} {
  const candidates = rules
    .filter((rule) => matches(rule, input))
    .sort((left, right) => {
      const leftRank = rank(left);
      const rightRank = rank(right);
      for (let index = 0; index < leftRank.length; index += 1) {
        if (leftRank[index] !== rightRank[index]) return rightRank[index]! - leftRank[index]!;
      }
      return left.id.localeCompare(right.id);
    });
  const best = candidates[0] ?? null;
  if (best === null) return { status: "none", candidates, selected: null };
  const tied = candidates.filter((candidate) => sameRank(candidate, best));
  return tied.length > 1
    ? { status: "ambiguous", candidates, selected: null }
    : { status: "selected", candidates, selected: best };
}
