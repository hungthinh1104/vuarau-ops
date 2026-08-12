import { describe, expect, it } from "vitest";
import type { InventoryMovementId, ProductId } from "@vuarau/domain-contracts";
import { calculateInventoryValuation, type InventoryValuationMovement } from "./index.ts";

const productId = "00000000-0000-4000-8000-000000000001" as ProductId;
const movement = (
  id: string,
  quantityScaled: number,
  unitCost: number | null,
  sourceType = quantityScaled > 0 ? "purchase_receipt" : "delivery_dispatch",
  reversalOfMovementId: string | null = null,
  currency: string = "VND",
): InventoryValuationMovement => ({
  movementId: id as InventoryMovementId,
  qualityGradeId: null,
  unit: "kg",
  quantityScaled,
  sourceType,
  sourceId: productId,
  sourceLineId: id,
  reversalOfMovementId: reversalOfMovementId as InventoryMovementId | null,
  transactionTime: `2026-08-03T00:00:0${id.at(-1)}.000Z`,
  recordedAt: `2026-08-03T00:00:1${id.at(-1)}.000Z`,
  unitCost:
    unitCost === null
      ? null
      : ({ amountMinor: unitCost, currency } as unknown as NonNullable<
          InventoryValuationMovement["unitCost"]
        >),
});

describe("BR-VALUATION-001 / BR-VALUATION-002 / BR-VALUATION-003 / TC-VALUATION-001", () => {
  it("calculates FIFO and moving weighted average from integer quantities and money", () => {
    const rows = [movement("1", 1000, 100), movement("2", 1000, 200), movement("3", -1000, null)];

    const fifo = calculateInventoryValuation(rows, "fifo")[0]!;
    const movingAverage = calculateInventoryValuation(rows, "moving_weighted_average")[0]!;

    expect(fifo).toMatchObject({
      quantityScaled: 1000,
      cogs: { amountMinor: 100, currency: "VND" },
      classifiedLossCost: null,
      inventoryValue: { amountMinor: 200, currency: "VND" },
      diagnostics: [],
    });
    expect(movingAverage).toMatchObject({
      quantityScaled: 1000,
      cogs: { amountMinor: 150, currency: "VND" },
      classifiedLossCost: null,
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
      classifiedLossCost: null,
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

  it("fails closed when valuation inputs contain mixed currencies", () => {
    const rows = [
      movement("1", 1_000, 100, "purchase_receipt", null, "VND"),
      movement("2", 1_000, 100, "purchase_receipt", null, "USD"),
      movement("3", 1_000, 100, "purchase_receipt", null, "USD"),
    ];

    for (const strategy of ["fifo", "moving_weighted_average"] as const) {
      const result = calculateInventoryValuation(rows, strategy)[0]!;
      expect(result.inventoryValue).toBeNull();
      expect(result.averageUnitCost).toBeNull();
      expect(result.diagnostics).toContain("mixed_currency");
    }
  });

  it("does not pretend a specific actual cost exists without a dispatch lot reference", () => {
    const result = calculateInventoryValuation(
      [movement("1", 1000, 100), movement("2", -1000, null)],
      "specific_actual_cost",
    )[0]!;

    expect(result.diagnostics).toContain("specific_cost_reference_missing");
  });

  it("uses reversal lineage for receipt reversals and customer returns", () => {
    const receipt = movement("1", 1000, 100);
    const dispatch = movement("2", -1000, null, "delivery_dispatch");
    const customerReturn = movement("3", 1000, null, "delivery_return", "2");
    const receiptReversal = movement("4", -1000, null, "purchase_receipt_reversal", "1");

    const returned = calculateInventoryValuation([receipt, dispatch, customerReturn], "fifo")[0]!;
    expect(returned).toMatchObject({
      quantityScaled: 1000,
      inventoryValue: { amountMinor: 100, currency: "VND" },
      cogs: { amountMinor: 0, currency: "VND" },
      classifiedLossCost: null,
      diagnostics: [],
    });

    const reversed = calculateInventoryValuation([receipt, receiptReversal], "fifo")[0]!;
    expect(reversed).toMatchObject({
      quantityScaled: 0,
      inventoryValue: null,
      cogs: null,
      diagnostics: [],
    });
  });

  it("preserves original receipt valuation when moving average reverses a later receipt", () => {
    const receiptA = movement("1", 1_000, 100);
    const receiptB = movement("2", 1_000, 200);
    const reversalB = movement("3", -1_000, null, "purchase_receipt_reversal", "2");

    const result = calculateInventoryValuation(
      [receiptA, receiptB, reversalB],
      "moving_weighted_average",
    )[0]!;

    expect(result).toMatchObject({
      quantityScaled: 1_000,
      inventoryValue: { amountMinor: 100, currency: "VND" },
      cogs: null,
      classifiedLossCost: null,
      diagnostics: [],
    });
  });

  it("keeps residual minor-unit value when moving-average unit cost is floored", () => {
    const result = calculateInventoryValuation(
      [movement("1", 1_000, 101), movement("2", 1_000, 100), movement("3", -1_000, null)],
      "moving_weighted_average",
    )[0]!;

    expect(result).toMatchObject({
      quantityScaled: 1_000,
      cogs: { amountMinor: 100, currency: "VND" },
      inventoryValue: { amountMinor: 101, currency: "VND" },
      diagnostics: [],
    });
  });

  it("preserves the exact moving-average cost pool across repeated outflows", () => {
    const result = calculateInventoryValuation(
      [
        movement("1", 1_000, 101),
        movement("2", 1_000, 100),
        movement("3", -500, null),
        movement("4", -500, null),
        movement("5", -500, null),
        movement("6", -500, null),
      ],
      "moving_weighted_average",
    )[0]!;

    expect(result).toMatchObject({
      quantityScaled: 0,
      inventoryValue: null,
      cogs: { amountMinor: 201, currency: "VND" },
      diagnostics: [],
    });
  });

  it("uses bigint proportional allocation when the intermediate product exceeds safe number range", () => {
    const result = calculateInventoryValuation(
      [movement("1", 11_000, 818_836_295_885_457), movement("2", -1_234, null)],
      "moving_weighted_average",
    )[0]!;

    // The receipt value is 9,007,199,254,740,027. The exact floor of its
    // 1,234/11,000 share is 1,010,443,989,122,653. A Number multiplication
    // rounds the intermediate product and produces one extra minor unit.
    expect(result).toMatchObject({
      quantityScaled: 9_766,
      cogs: { amountMinor: 1_010_443_989_122_653, currency: "VND" },
      inventoryValue: { amountMinor: 7_996_755_265_617_374, currency: "VND" },
      diagnostics: [],
    });
    expect(result.cogs!.amountMinor + result.inventoryValue!.amountMinor).toBe(
      9_007_199_254_740_027,
    );
  });

  it("rejects a quantity pool that cannot be represented exactly", () => {
    const rows = [
      movement("1", Number.MAX_SAFE_INTEGER, null, "inventory_adjustment"),
      movement("2", 1, null, "inventory_adjustment"),
    ];

    expect(() => calculateInventoryValuation(rows, "fifo")).toThrow(
      "Integer arithmetic exceeds the exact supported range.",
    );
    expect(() => calculateInventoryValuation(rows, "moving_weighted_average")).toThrow(
      "Integer arithmetic exceeds the exact supported range.",
    );
  });

  it("does not classify adjustment loss as COGS", () => {
    const result = calculateInventoryValuation(
      [movement("1", 1000, 100), movement("2", -500, null, "inventory_adjustment")],
      "fifo",
    )[0]!;

    expect(result).toMatchObject({
      quantityScaled: 500,
      inventoryValue: { amountMinor: 50, currency: "VND" },
      cogs: null,
      classifiedLossCost: { amountMinor: 50, currency: "VND" },
      diagnostics: [],
    });
  });

  it("fails closed when a compensation has missing or invalid lineage", () => {
    const receipt = movement("1", 1000, 100);
    const missingLineage = movement("2", -1000, null, "purchase_receipt_reversal");
    const wrongDirection = movement("3", 1000, null, "delivery_return", "1");

    const missing = calculateInventoryValuation([receipt, missingLineage], "fifo")[0]!;
    expect(missing.diagnostics).toContain("reversal_lineage_missing");

    const invalid = calculateInventoryValuation([receipt, wrongDirection], "fifo")[0]!;
    expect(invalid.diagnostics).toContain("reversal_direction_invalid");
  });
});
