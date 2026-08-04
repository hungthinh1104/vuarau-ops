import type {
  InventoryValuationSource,
  InventoryValuationStrategy,
  InventoryMovementId,
  IsoInstant,
  Money,
  QualityGradeId,
  Unit,
} from "@vuarau/domain-contracts";
import { calculateLineTotal } from "@vuarau/domain-contracts";

export type InventoryValuationMovement = {
  readonly movementId: InventoryMovementId;
  readonly qualityGradeId: QualityGradeId | null;
  readonly unit: Unit;
  readonly quantityScaled: number;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly sourceLineId: string | null;
  readonly reversalOfMovementId: string | null;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
  readonly unitCost: Money | null;
};

export type InventoryValuationCalculation = {
  readonly qualityGradeId: QualityGradeId | null;
  readonly unit: Unit;
  readonly quantityScaled: number;
  readonly inventoryValue: Money | null;
  readonly cogs: Money | null;
  readonly classifiedLossCost: Money | null;
  readonly averageUnitCost: Money | null;
  readonly diagnostics: readonly string[];
  readonly inputReferences: readonly InventoryValuationSource[];
};

type CostAllocation = { quantityScaled: number; unitCost: Money };
type Layer = {
  quantityScaled: number;
  unitCost: Money;
  movementId: string;
  sourceId: string;
};
type DiagnosticSink = { add(value: string): void };

const reversalSourceTypes = new Set([
  "purchase_receipt_reversal",
  "delivery_return",
  "quality_disposition_reversal",
]);

function compareMovement(left: InventoryValuationMovement, right: InventoryValuationMovement) {
  return left.transactionTime !== right.transactionTime
    ? left.transactionTime.localeCompare(right.transactionTime)
    : left.recordedAt !== right.recordedAt
      ? left.recordedAt.localeCompare(right.recordedAt)
      : left.movementId.localeCompare(right.movementId);
}

function addMoney(left: Money, right: Money): Money | null {
  return left.currency === right.currency
    ? { amountMinor: left.amountMinor + right.amountMinor, currency: left.currency }
    : null;
}

function layerValue(quantityScaled: number, unit: Unit, unitCost: Money): Money {
  return calculateLineTotal({ valueScaled: quantityScaled, unit }, unitCost);
}

function consume(
  layers: Layer[],
  quantityScaled: number,
  unit: Unit,
  strategy: InventoryValuationStrategy,
  diagnostics: DiagnosticSink,
  allocations: CostAllocation[],
): Money | null {
  let remaining = quantityScaled;
  let total: Money | null = null;
  const movingAverageUnitCost =
    strategy === "moving_weighted_average"
      ? (() => {
          const totalQuantity = layers.reduce(
            (sum, candidate) => sum + candidate.quantityScaled,
            0,
          );
          const totalValue = layers.reduce<Money | null>((sum, candidate) => {
            const value = layerValue(candidate.quantityScaled, unit, candidate.unitCost);
            return sum === null ? value : addMoney(sum, value);
          }, null);
          if (totalValue === null || totalQuantity === 0) {
            diagnostics.add("mixed_currency");
            return null;
          }
          return {
            amountMinor: Math.floor((totalValue.amountMinor * 1000) / totalQuantity),
            currency: totalValue.currency,
          };
        })()
      : null;
  while (remaining > 0) {
    const layerIndex = 0;
    const layer = layers[layerIndex];
    if (layer === undefined) {
      diagnostics.add("negative_inventory");
      return total;
    }
    const taken = Math.min(remaining, layer.quantityScaled);
    const unitCost = movingAverageUnitCost ?? layer.unitCost;
    const value = layerValue(taken, unit, unitCost);
    total = total === null ? value : addMoney(total, value);
    if (total === null) diagnostics.add("mixed_currency");
    allocations.push({ quantityScaled: taken, unitCost });
    layer.quantityScaled -= taken;
    remaining -= taken;
    if (layer.quantityScaled === 0) layers.splice(layerIndex, 1);
  }
  return total;
}

function removeFromMovementLayer(
  layers: Layer[],
  movementId: string,
  quantityScaled: number,
  diagnostics: DiagnosticSink,
): void {
  let remaining = quantityScaled;
  for (const layer of layers) {
    if (remaining === 0) break;
    if (layer.movementId !== movementId) continue;
    const taken = Math.min(remaining, layer.quantityScaled);
    layer.quantityScaled -= taken;
    remaining -= taken;
  }
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    if (layers[index]!.quantityScaled === 0) layers.splice(index, 1);
  }
  if (remaining > 0) diagnostics.add("reversal_quantity_unavailable");
}

export function calculateInventoryValuation(
  movements: readonly InventoryValuationMovement[],
  strategy: InventoryValuationStrategy,
): readonly InventoryValuationCalculation[] {
  const groups = new Map<string, InventoryValuationMovement[]>();
  for (const movement of movements) {
    const key = `${movement.qualityGradeId ?? "legacy"}:${movement.unit}`;
    const group = groups.get(key) ?? [];
    group.push(movement);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, rows]) => {
      const ordered = [...rows].sort(compareMovement);
      const diagnostics = new Set<string>();
      const inputReferences: InventoryValuationSource[] = ordered.map((movement) => ({
        movementId: movement.movementId as InventoryValuationSource["movementId"],
        sourceType: movement.sourceType,
        sourceId: movement.sourceId,
        sourceLineId: movement.sourceLineId,
      }));
      let quantityScaled = 0;
      let cogs: Money | null = null;
      let grossCogs: Money | null = null;
      let classifiedLossCost: Money | null = null;
      let inboundValue: Money | null = null;
      let inboundReversalValue: Money | null = null;
      let returnRestorationValue: Money | null = null;
      const layers: Layer[] = [];
      const movementById = new Map<string, InventoryValuationMovement>(
        ordered.map((movement) => [movement.movementId as string, movement]),
      );
      const allocationsByMovementId = new Map<string, CostAllocation[]>();

      for (const movement of ordered) {
        quantityScaled += movement.quantityScaled;
        if (strategy === "no_valuation") continue;
        if (
          reversalSourceTypes.has(movement.sourceType) &&
          movement.reversalOfMovementId === null
        ) {
          diagnostics.add("reversal_lineage_missing");
          continue;
        }
        if (movement.quantityScaled > 0) {
          if (movement.reversalOfMovementId !== null) {
            const original = movementById.get(movement.reversalOfMovementId);
            if (original === undefined) {
              diagnostics.add("reversal_lineage_missing");
              continue;
            }
            if (original.quantityScaled >= 0) {
              diagnostics.add("reversal_direction_invalid");
              continue;
            }
            const allocations = allocationsByMovementId.get(original.movementId);
            if (allocations === undefined) {
              diagnostics.add("reversal_cost_lineage_missing");
              continue;
            }
            let remaining = movement.quantityScaled;
            let restoredValue: Money | null = null;
            for (const allocation of allocations) {
              if (remaining === 0) break;
              const restored = Math.min(remaining, allocation.quantityScaled);
              layers.push({
                quantityScaled: restored,
                unitCost: allocation.unitCost,
                movementId: movement.movementId,
                sourceId: movement.sourceId,
              });
              const value = layerValue(restored, movement.unit, allocation.unitCost);
              restoredValue = restoredValue === null ? value : addMoney(restoredValue, value);
              remaining -= restored;
            }
            if (remaining > 0) diagnostics.add("reversal_cost_quantity_unavailable");
            if (restoredValue !== null) {
              if (original.sourceType === "delivery_dispatch") {
                returnRestorationValue =
                  returnRestorationValue === null
                    ? restoredValue
                    : addMoney(returnRestorationValue, restoredValue);
                cogs =
                  cogs === null
                    ? { amountMinor: -restoredValue.amountMinor, currency: restoredValue.currency }
                    : addMoney(cogs, {
                        amountMinor: -restoredValue.amountMinor,
                        currency: restoredValue.currency,
                      });
              } else {
                classifiedLossCost =
                  classifiedLossCost === null
                    ? { amountMinor: -restoredValue.amountMinor, currency: restoredValue.currency }
                    : addMoney(classifiedLossCost, {
                        amountMinor: -restoredValue.amountMinor,
                        currency: restoredValue.currency,
                      });
              }
            }
            continue;
          }
          if (movement.unitCost === null) {
            diagnostics.add("missing_unit_cost");
            continue;
          }
          if (strategy === "specific_actual_cost" && movement.sourceLineId === null) {
            diagnostics.add("specific_cost_reference_missing");
          }
          layers.push({
            quantityScaled: movement.quantityScaled,
            unitCost: movement.unitCost,
            movementId: movement.movementId,
            sourceId: movement.sourceId,
          });
          const value = layerValue(movement.quantityScaled, movement.unit, movement.unitCost);
          inboundValue = inboundValue === null ? value : addMoney(inboundValue, value);
          continue;
        }
        if (movement.reversalOfMovementId !== null) {
          const original = movementById.get(movement.reversalOfMovementId);
          if (original === undefined) {
            diagnostics.add("reversal_lineage_missing");
          } else if (original.quantityScaled <= 0) {
            diagnostics.add("reversal_direction_invalid");
          } else {
            removeFromMovementLayer(
              layers,
              original.movementId,
              Math.abs(movement.quantityScaled),
              diagnostics,
            );
            if (original.unitCost !== null) {
              const value = layerValue(
                Math.abs(movement.quantityScaled),
                movement.unit,
                original.unitCost,
              );
              inboundReversalValue =
                inboundReversalValue === null ? value : addMoney(inboundReversalValue, value);
            }
          }
          continue;
        }
        if (strategy === "specific_actual_cost" && movement.sourceType === "delivery_dispatch") {
          diagnostics.add("specific_cost_reference_missing");
        }
        const allocations: CostAllocation[] = [];
        const amount = consume(
          layers,
          Math.abs(movement.quantityScaled),
          movement.unit,
          strategy,
          diagnostics,
          allocations,
        );
        allocationsByMovementId.set(movement.movementId, allocations);
        if (movement.sourceType === "delivery_dispatch" && amount !== null) {
          grossCogs = grossCogs === null ? amount : addMoney(grossCogs, amount);
          cogs = cogs === null ? amount : addMoney(cogs, amount);
        } else if (amount !== null) {
          classifiedLossCost =
            classifiedLossCost === null ? amount : addMoney(classifiedLossCost, amount);
        }
      }

      const layerInventoryValue = layers.reduce<Money | null>((total, layer) => {
        const value = layerValue(layer.quantityScaled, ordered[0]!.unit, layer.unitCost);
        return total === null ? value : addMoney(total, value);
      }, null);
      const movingAverageInventoryValue = [
        inboundValue,
        returnRestorationValue,
        inboundReversalValue === null
          ? null
          : {
              amountMinor: -inboundReversalValue.amountMinor,
              currency: inboundReversalValue.currency,
            },
        grossCogs === null
          ? null
          : { amountMinor: -grossCogs.amountMinor, currency: grossCogs.currency },
        classifiedLossCost === null
          ? null
          : {
              amountMinor: -classifiedLossCost.amountMinor,
              currency: classifiedLossCost.currency,
            },
      ].reduce<Money | null>((total, value) => {
        if (value === null) return total;
        return total === null ? value : addMoney(total, value);
      }, null);
      const inventoryValue =
        strategy === "no_valuation"
          ? null
          : strategy === "moving_weighted_average"
            ? quantityScaled <= 0
              ? null
              : movingAverageInventoryValue
            : layerInventoryValue;
      const averageUnitCost =
        inventoryValue === null || quantityScaled <= 0
          ? null
          : {
              amountMinor: Math.floor((inventoryValue.amountMinor * 1000) / quantityScaled),
              currency: inventoryValue.currency,
            };
      return {
        qualityGradeId: ordered[0]!.qualityGradeId,
        unit: ordered[0]!.unit,
        quantityScaled,
        inventoryValue,
        cogs,
        classifiedLossCost,
        averageUnitCost,
        diagnostics: [...diagnostics],
        inputReferences,
      };
    });
}
