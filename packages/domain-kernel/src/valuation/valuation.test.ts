import { describe, expect, it } from "vitest";
import type { InventoryMovementId, ProductId } from "@vuarau/domain-contracts";
import { calculateInventoryValuation, type InventoryValuationMovement } from "./index.ts";

const productId = "00000000-0000-4000-8000-000000000001" as ProductId;
const movement = (
  id: string,
  quantityScaled: number,
  unitCost: number | null,
  sourceType = quantityScaled > 0 ? "purchase_receipt" : "delivery_dispatch",
): InventoryValuationMovement => ({
  movementId: id as InventoryMovementId,
  qualityGradeId: null,
  unit: "kg",
  quantityScaled,
  sourceType,
  sourceId: productId,
  sourceLineId: id,
  reversalOfMovementId: null,
  transactionTime: `2026-08-03T00:00:0${id.at(-1)}.000Z`,
  recordedAt: `2026-08-03T00:00:1${id.at(-1)}.000Z`,
  unitCost: unitCost === null ? null : { amountMinor: unitCost, currency: "VND" },
});

describe("BR-VALUATION-001 / BR-VALUATION-002 / BR-VALUATION-003 / TC-VALUATION-001", () => {
  it("calculates FIFO and moving weighted average from integer quantities and money", () => {
    const rows = [movement("1", 1000, 100), movement("2", 1000, 200), movement("3", -1000, null)];

    const fifo = calculateInventoryValuation(rows, "fifo")[0]!;
    const movingAverage = calculateInventoryValuation(rows, "moving_weighted_average")[0]!;

    expect(fifo).toMatchObject({
      quantityScaled: 1000,
      cogs: { amountMinor: 100, currency: "VND" },
      inventoryValue: { amountMinor: 200, currency: "VND" },
      diagnostics: [],
    });
    expect(movingAverage).toMatchObject({
      quantityScaled: 1000,
      cogs: { amountMinor: 150, currency: "VND" },
      inventoryValue: { amountMinor: 150, currency: "VND" },
      diagnostics: [],
    });
  });

  it("keeps no valuation explicit and does not invent a monetary result", () => {
    const result = calculateInventoryValuation(
      [movement("1", 1000, null, "inventory_adjustment")],
      "no_valuation",
    )[0]!;

    expect(result).toMatchObject({
      quantityScaled: 1000,
      inventoryValue: null,
      cogs: null,
      averageUnitCost: null,
      diagnostics: [],
    });
  });

  it("fails closed when a physical movement has no cost lineage", () => {
    const result = calculateInventoryValuation(
      [movement("1", 1000, null, "inventory_adjustment")],
      "fifo",
    )[0]!;

    expect(result.diagnostics).toContain("missing_unit_cost");
    expect(result.inventoryValue).toBeNull();
  });

  it("does not pretend a specific actual cost exists without a dispatch lot reference", () => {
    const result = calculateInventoryValuation(
      [movement("1", 1000, 100), movement("2", -1000, null)],
      "specific_actual_cost",
    )[0]!;

    expect(result.diagnostics).toContain("specific_cost_reference_missing");
  });
});
