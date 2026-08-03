import type { IsoInstant, StockPlanningRow, StockPlanningRule } from "@vuarau/domain-contracts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

export type StockPlanningMovement = {
  readonly id: string;
  readonly productId: string;
  readonly qualityGradeId: string | null;
  readonly quantity: { readonly valueScaled: number; readonly unit: string };
  readonly transactionTime: IsoInstant;
};

export type StockPlanningCalculation = {
  readonly strategy: "fixed_threshold";
  readonly rows: readonly StockPlanningRow[];
};

function key(productId: string, qualityGradeId: string | null, unit: string): string {
  return `${productId}:${qualityGradeId ?? "ung raded"}:${unit}`;
}

/**
 * Derives a reproducible reorder view from immutable movement facts and an
 * explicitly approved threshold policy. It never treats missing movement data
 * as zero: a rule with no matching source is still a known zero balance, while
 * an overflow or unit mismatch fails closed.
 */
export function calculateFixedThresholdPlan(args: {
  readonly rules: readonly StockPlanningRule[];
  readonly movements: readonly StockPlanningMovement[];
  readonly asOf: IsoInstant;
}): DomainResult<StockPlanningCalculation> {
  const totals = new Map<string, { quantityScaled: number; movementIds: string[] }>();
  for (const movement of args.movements) {
    if (Date.parse(movement.transactionTime) > Date.parse(args.asOf)) continue;
    const movementKey = key(movement.productId, movement.qualityGradeId, movement.quantity.unit);
    const current = totals.get(movementKey) ?? { quantityScaled: 0, movementIds: [] };
    const next = current.quantityScaled + movement.quantity.valueScaled;
    if (!Number.isSafeInteger(next)) {
      return err("STOCK_PLANNING_POLICY_UNAVAILABLE", "Inventory quantity exceeds exact range.");
    }
    current.quantityScaled = next;
    current.movementIds.push(movement.id);
    totals.set(movementKey, current);
  }

  const rows: StockPlanningRow[] = [];
  for (const rule of args.rules) {
    const entry = totals.get(key(rule.productId, rule.qualityGradeId, rule.unit));
    const currentQuantity = entry?.quantityScaled ?? 0;
    const suggestedQuantity = Math.max(0, rule.targetQuantity.valueScaled - currentQuantity);
    if (!Number.isSafeInteger(suggestedQuantity)) {
      return err("STOCK_PLANNING_POLICY_UNAVAILABLE", "Suggested quantity exceeds exact range.");
    }
    rows.push({
      productId: rule.productId,
      qualityGradeId: rule.qualityGradeId,
      unit: rule.unit,
      currentQuantity: { valueScaled: currentQuantity, unit: rule.unit },
      minimumQuantity: { ...rule.minimumQuantity },
      targetQuantity: { ...rule.targetQuantity },
      suggestedQuantity: { valueScaled: suggestedQuantity, unit: rule.unit },
      reorderRequired: currentQuantity < rule.minimumQuantity.valueScaled,
      sourceMovementIds: (entry?.movementIds ?? []) as StockPlanningRow["sourceMovementIds"],
    });
  }
  return ok({ strategy: "fixed_threshold", rows });
}
