import { describe, expect, it } from "vitest";
import type { InventoryMovementState } from "../shared/state.ts";
import { calculateFixedThresholdPlan } from "./stock-planning.ts";

const movement = (input: Partial<InventoryMovementState>): InventoryMovementState =>
  ({
    id: "00000000-0000-4000-8000-000000000001",
    workspaceId: "00000000-0000-4000-8000-000000000010",
    productId: "00000000-0000-4000-8000-000000000020",
    qualityGradeId: null,
    qualityGradeName: null,
    quantity: { valueScaled: 5_000, unit: "kg" },
    sourceType: "purchase_receipt",
    sourceId: "00000000-0000-4000-8000-000000000030",
    sourceLineId: null,
    reversalOfMovementId: null,
    reasonCode: null,
    reason: null,
    transactionTime: "2026-08-01T00:00:00.000Z",
    recordedAt: "2026-08-01T00:00:00.000Z",
    actorId: "00000000-0000-4000-8000-000000000040",
    commandId: "00000000-0000-4000-8000-000000000050",
    ...input,
  }) as InventoryMovementState;

describe("fixed threshold stock planning", () => {
  it("returns a deterministic reorder quantity and movement lineage", () => {
    const result = calculateFixedThresholdPlan({
      asOf: "2026-08-02T00:00:00.000Z",
      movements: [movement({})],
      rules: [
        {
          productId: "00000000-0000-4000-8000-000000000020" as never,
          qualityGradeId: null,
          unit: "kg",
          minimumQuantity: { valueScaled: 10_000, unit: "kg" },
          targetQuantity: { valueScaled: 20_000, unit: "kg" },
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]).toMatchObject({
      currentQuantity: { valueScaled: 5_000 },
      suggestedQuantity: { valueScaled: 15_000 },
      reorderRequired: true,
    });
    expect(result.value.rows[0]?.sourceMovementIds).toHaveLength(1);
  });

  it("does not include movements after the requested historical as-of", () => {
    const result = calculateFixedThresholdPlan({
      asOf: "2026-08-01T12:00:00.000Z",
      movements: [
        movement({ quantity: { valueScaled: 5_000, unit: "kg" } }),
        movement({
          id: "00000000-0000-4000-8000-000000000002" as never,
          quantity: { valueScaled: 7_000, unit: "kg" },
          transactionTime: "2026-08-02T00:00:00.000Z",
        }),
      ],
      rules: [
        {
          productId: "00000000-0000-4000-8000-000000000020" as never,
          qualityGradeId: null,
          unit: "kg",
          minimumQuantity: { valueScaled: 1_000, unit: "kg" },
          targetQuantity: { valueScaled: 6_000, unit: "kg" },
        },
      ],
    });
    expect(result.ok && result.value.rows[0]?.currentQuantity.valueScaled).toBe(5_000);
  });
});
