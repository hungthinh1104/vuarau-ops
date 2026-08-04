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

type MoneyAccumulator = {
  value: Money | null;
  invalid: boolean;
};

function createMoneyAccumulator(): MoneyAccumulator {
  return { value: null, invalid: false };
}

function appendMoney(
  accumulator: MoneyAccumulator,
  value: Money,
  diagnostics: DiagnosticSink,
): void {
  if (accumulator.invalid) return;
  if (accumulator.value === null) {
    accumulator.value = value;
    return;
  }
  const next = addMoney(accumulator.value, value);
  if (next === null) {
    accumulator.invalid = true;
    diagnostics.add("mixed_currency");
    return;
  }
  accumulator.value = next;
}

function layerValue(quantityScaled: number, unit: Unit, unitCost: Money): Money {
  return calculateLineTotal({ valueScaled: quantityScaled, unit }, unitCost);
}

function consume(
  layers: Layer[],
  quantityScaled: number,
  unit: Unit,
  diagnostics: DiagnosticSink,
  allocations: CostAllocation[],
): Money | null {
  let remaining = quantityScaled;
  const total = createMoneyAccumulator();
  while (remaining > 0) {
    const layerIndex = 0;
    const layer = layers[layerIndex];
    if (layer === undefined) {
      diagnostics.add("negative_inventory");
      return total.invalid ? null : total.value;
    }
    const taken = Math.min(remaining, layer.quantityScaled);
    const value = layerValue(taken, unit, layer.unitCost);
    appendMoney(total, value, diagnostics);
    allocations.push({ quantityScaled: taken, unitCost: layer.unitCost });
    layer.quantityScaled -= taken;
    remaining -= taken;
    if (layer.quantityScaled === 0) layers.splice(layerIndex, 1);
  }
  return total.invalid ? null : total.value;
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

type MovingAverageLineage = {
  quantityScaled: number;
  value: Money;
};

type MovingAveragePool = {
  quantityScaled: number;
  value: MoneyAccumulator;
};

function proportionalMoney(
  value: Money,
  quantityScaled: number,
  totalQuantityScaled: number,
): Money {
  if (quantityScaled === totalQuantityScaled) return value;
  return {
    amountMinor: Math.floor((value.amountMinor * quantityScaled) / totalQuantityScaled),
    currency: value.currency,
  };
}

function takeMovingAverageLineage(
  lineage: MovingAverageLineage,
  requestedQuantityScaled: number,
  availableQuantityScaled: number | null,
  diagnostics: DiagnosticSink,
): { quantityScaled: number; value: Money } | null {
  const quantityScaled = Math.min(
    requestedQuantityScaled,
    lineage.quantityScaled,
    availableQuantityScaled ?? Number.POSITIVE_INFINITY,
  );
  if (quantityScaled < requestedQuantityScaled) {
    diagnostics.add("reversal_cost_quantity_unavailable");
  }
  if (quantityScaled <= 0 || lineage.quantityScaled <= 0) return null;
  const value = proportionalMoney(lineage.value, quantityScaled, lineage.quantityScaled);
  lineage.quantityScaled -= quantityScaled;
  lineage.value = {
    amountMinor: lineage.value.amountMinor - value.amountMinor,
    currency: lineage.value.currency,
  };
  return { quantityScaled, value };
}

function addToMovingAveragePool(
  pool: MovingAveragePool,
  quantityScaled: number,
  value: Money,
  diagnostics: DiagnosticSink,
): void {
  pool.quantityScaled += quantityScaled;
  appendMoney(pool.value, value, diagnostics);
}

function consumeMovingAveragePool(
  pool: MovingAveragePool,
  requestedQuantityScaled: number,
  diagnostics: DiagnosticSink,
): { quantityScaled: number; value: Money | null } {
  const availableQuantityScaled = pool.quantityScaled;
  const quantityScaled = Math.min(requestedQuantityScaled, availableQuantityScaled);
  if (quantityScaled < requestedQuantityScaled) diagnostics.add("negative_inventory");
  if (quantityScaled <= 0) return { quantityScaled: 0, value: null };

  pool.quantityScaled -= quantityScaled;
  if (pool.value.invalid || pool.value.value === null) {
    diagnostics.add("missing_unit_cost");
    return { quantityScaled, value: null };
  }
  const value = proportionalMoney(pool.value.value, quantityScaled, availableQuantityScaled);
  appendMoney(
    pool.value,
    { amountMinor: -value.amountMinor, currency: value.currency },
    diagnostics,
  );
  return { quantityScaled, value };
}

function calculateMovingAverageValuation(
  ordered: readonly InventoryValuationMovement[],
  inputReferences: readonly InventoryValuationSource[],
): InventoryValuationCalculation {
  const diagnostics = new Set<string>();
  const pool: MovingAveragePool = {
    quantityScaled: 0,
    value: createMoneyAccumulator(),
  };
  const cogs = createMoneyAccumulator();
  const classifiedLossCost = createMoneyAccumulator();
  const inboundLineage = new Map<string, MovingAverageLineage>();
  const outflowLineage = new Map<string, MovingAverageLineage>();
  const movementById = new Map<string, InventoryValuationMovement>(
    ordered.map((movement) => [movement.movementId as string, movement]),
  );
  let quantityScaled = 0;

  for (const movement of ordered) {
    quantityScaled += movement.quantityScaled;
    if (reversalSourceTypes.has(movement.sourceType) && movement.reversalOfMovementId === null) {
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
        const lineage = outflowLineage.get(original.movementId);
        if (lineage === undefined) {
          diagnostics.add("reversal_cost_lineage_missing");
          continue;
        }
        const restored = takeMovingAverageLineage(
          lineage,
          movement.quantityScaled,
          null,
          diagnostics,
        );
        if (restored !== null) {
          addToMovingAveragePool(pool, restored.quantityScaled, restored.value, diagnostics);
          const target = original.sourceType === "delivery_dispatch" ? cogs : classifiedLossCost;
          appendMoney(
            target,
            { amountMinor: -restored.value.amountMinor, currency: restored.value.currency },
            diagnostics,
          );
        }
        continue;
      }

      if (movement.unitCost === null) {
        diagnostics.add("missing_unit_cost");
        continue;
      }
      const value = layerValue(movement.quantityScaled, movement.unit, movement.unitCost);
      addToMovingAveragePool(pool, movement.quantityScaled, value, diagnostics);
      inboundLineage.set(movement.movementId, {
        quantityScaled: movement.quantityScaled,
        value,
      });
      continue;
    }

    if (movement.reversalOfMovementId !== null) {
      const original = movementById.get(movement.reversalOfMovementId);
      if (original === undefined) {
        diagnostics.add("reversal_lineage_missing");
        continue;
      }
      if (original.quantityScaled <= 0) {
        diagnostics.add("reversal_direction_invalid");
        continue;
      }
      const lineage = inboundLineage.get(original.movementId);
      if (lineage === undefined) {
        diagnostics.add("reversal_cost_lineage_missing");
        continue;
      }
      const reversed = takeMovingAverageLineage(
        lineage,
        Math.abs(movement.quantityScaled),
        pool.quantityScaled,
        diagnostics,
      );
      if (reversed !== null) {
        pool.quantityScaled -= reversed.quantityScaled;
        appendMoney(
          pool.value,
          { amountMinor: -reversed.value.amountMinor, currency: reversed.value.currency },
          diagnostics,
        );
      }
      continue;
    }

    const outflow = consumeMovingAveragePool(pool, Math.abs(movement.quantityScaled), diagnostics);
    if (outflow.value !== null && outflow.quantityScaled > 0) {
      outflowLineage.set(movement.movementId, {
        quantityScaled: outflow.quantityScaled,
        value: outflow.value,
      });
      appendMoney(
        movement.sourceType === "delivery_dispatch" ? cogs : classifiedLossCost,
        outflow.value,
        diagnostics,
      );
    }
  }

  const inventoryValue = quantityScaled <= 0 || pool.value.invalid ? null : pool.value.value;
  return {
    qualityGradeId: ordered[0]!.qualityGradeId,
    unit: ordered[0]!.unit,
    quantityScaled,
    inventoryValue,
    cogs: cogs.invalid ? null : cogs.value,
    classifiedLossCost: classifiedLossCost.invalid ? null : classifiedLossCost.value,
    averageUnitCost:
      inventoryValue === null || quantityScaled <= 0
        ? null
        : {
            amountMinor: Math.floor((inventoryValue.amountMinor * 1000) / quantityScaled),
            currency: inventoryValue.currency,
          },
    diagnostics: [...diagnostics],
    inputReferences,
  };
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
      if (strategy === "moving_weighted_average") {
        return calculateMovingAverageValuation(ordered, inputReferences);
      }
      let quantityScaled = 0;
      const cogs = createMoneyAccumulator();
      const grossCogs = createMoneyAccumulator();
      const classifiedLossCost = createMoneyAccumulator();
      const inboundValue = createMoneyAccumulator();
      const inboundReversalValue = createMoneyAccumulator();
      const returnRestorationValue = createMoneyAccumulator();
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
            const restoredValue = createMoneyAccumulator();
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
              appendMoney(restoredValue, value, diagnostics);
              remaining -= restored;
            }
            if (remaining > 0) diagnostics.add("reversal_cost_quantity_unavailable");
            if (!restoredValue.invalid && restoredValue.value !== null) {
              const restoredAmount = restoredValue.value;
              if (original.sourceType === "delivery_dispatch") {
                appendMoney(returnRestorationValue, restoredAmount, diagnostics);
                appendMoney(
                  cogs,
                  { amountMinor: -restoredAmount.amountMinor, currency: restoredAmount.currency },
                  diagnostics,
                );
              } else {
                appendMoney(
                  classifiedLossCost,
                  { amountMinor: -restoredAmount.amountMinor, currency: restoredAmount.currency },
                  diagnostics,
                );
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
          appendMoney(inboundValue, value, diagnostics);
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
              appendMoney(inboundReversalValue, value, diagnostics);
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
          diagnostics,
          allocations,
        );
        allocationsByMovementId.set(movement.movementId, allocations);
        if (movement.sourceType === "delivery_dispatch" && amount !== null) {
          appendMoney(grossCogs, amount, diagnostics);
          appendMoney(cogs, amount, diagnostics);
        } else if (amount !== null) {
          appendMoney(classifiedLossCost, amount, diagnostics);
        }
      }

      const layerInventoryValue = createMoneyAccumulator();
      for (const layer of layers) {
        const value = layerValue(layer.quantityScaled, ordered[0]!.unit, layer.unitCost);
        appendMoney(layerInventoryValue, value, diagnostics);
      }
      const movingAverageInventoryValue = createMoneyAccumulator();
      const movingAverageComponents = [
        inboundValue.value,
        returnRestorationValue.value,
        inboundReversalValue.value === null
          ? null
          : {
              amountMinor: -inboundReversalValue.value.amountMinor,
              currency: inboundReversalValue.value.currency,
            },
        grossCogs.value === null
          ? null
          : { amountMinor: -grossCogs.value.amountMinor, currency: grossCogs.value.currency },
        classifiedLossCost.value === null
          ? null
          : {
              amountMinor: -classifiedLossCost.value.amountMinor,
              currency: classifiedLossCost.value.currency,
            },
      ];
      if (
        inboundValue.invalid ||
        returnRestorationValue.invalid ||
        inboundReversalValue.invalid ||
        grossCogs.invalid ||
        classifiedLossCost.invalid
      ) {
        movingAverageInventoryValue.invalid = true;
      }
      for (const value of movingAverageComponents) {
        if (value !== null) appendMoney(movingAverageInventoryValue, value, diagnostics);
      }
      const inventoryValue =
        strategy === "no_valuation"
          ? null
          : layerInventoryValue.invalid
            ? null
            : layerInventoryValue.value;
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
        cogs: cogs.invalid ? null : cogs.value,
        classifiedLossCost: classifiedLossCost.invalid ? null : classifiedLossCost.value,
        averageUnitCost,
        diagnostics: [...diagnostics],
        inputReferences,
      };
    });
}
