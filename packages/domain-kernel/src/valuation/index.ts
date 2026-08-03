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
  readonly averageUnitCost: Money | null;
  readonly diagnostics: readonly string[];
  readonly inputReferences: readonly InventoryValuationSource[];
};

type Layer = { quantityScaled: number; unitCost: Money; sourceId: string };
type DiagnosticSink = { add(value: string): void };

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
): Money | null {
  let remaining = quantityScaled;
  let total: Money | null = null;
  while (remaining > 0) {
    const layerIndex = 0;
    const layer = layers[layerIndex];
    if (layer === undefined) {
      diagnostics.add("negative_inventory");
      return total;
    }
    const taken = Math.min(remaining, layer.quantityScaled);
    const unitCost =
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
              return layer.unitCost;
            }
            return {
              amountMinor: Math.floor((totalValue.amountMinor * 1000) / totalQuantity),
              currency: totalValue.currency,
            };
          })()
        : layer.unitCost;
    const value = layerValue(taken, unit, unitCost);
    total = total === null ? value : addMoney(total, value);
    if (total === null) diagnostics.add("mixed_currency");
    layer.quantityScaled -= taken;
    remaining -= taken;
    if (layer.quantityScaled === 0) layers.splice(layerIndex, 1);
  }
  return total;
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
      const layers: Layer[] = [];

      for (const movement of ordered) {
        quantityScaled += movement.quantityScaled;
        if (strategy === "no_valuation") continue;
        if (movement.quantityScaled > 0) {
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
            sourceId: movement.sourceId,
          });
          if (strategy === "moving_weighted_average") {
            const totalQuantity = layers.reduce((sum, layer) => sum + layer.quantityScaled, 0);
            const totalValue = layers.reduce<Money | null>((sum, layer) => {
              const value = layerValue(layer.quantityScaled, movement.unit, layer.unitCost);
              return sum === null ? value : addMoney(sum, value);
            }, null);
            if (totalValue === null) diagnostics.add("mixed_currency");
            else {
              const averageUnitCost = {
                amountMinor: Math.floor((totalValue.amountMinor * 1000) / totalQuantity),
                currency: totalValue.currency,
              };
              for (const layer of layers) layer.unitCost = averageUnitCost;
            }
          }
          continue;
        }
        const amount =
          strategy === "specific_actual_cost"
            ? (diagnostics.add("specific_cost_reference_missing"), null)
            : consume(
                layers,
                Math.abs(movement.quantityScaled),
                movement.unit,
                strategy,
                diagnostics,
              );
        if (amount !== null) cogs = cogs === null ? amount : addMoney(cogs, amount);
      }

      const inventoryValue =
        strategy === "no_valuation"
          ? null
          : layers.reduce<Money | null>((total, layer) => {
              const value = layerValue(layer.quantityScaled, ordered[0]!.unit, layer.unitCost);
              return total === null ? value : addMoney(total, value);
            }, null);
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
        averageUnitCost,
        diagnostics: [...diagnostics],
        inputReferences,
      };
    });
}
