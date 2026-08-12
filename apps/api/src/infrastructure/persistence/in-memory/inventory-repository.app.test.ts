import { describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  OTHER_WORKSPACE_ID,
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import type { CommandId, ProductId, QualityGradeId } from "@vuarau/domain-contracts";
import type { InventoryMovementState } from "@vuarau/domain-kernel";
import { createInventoryRepositories } from "./repositories/inventory.ts";
import { emptyStore } from "./store.ts";
import { sequentialIdGenerator } from "./store.ts";

const movement = (overrides: Partial<Omit<InventoryMovementState, "id">> = {}) => ({
  workspaceId: WORKSPACE_ID,
  productId: PRODUCT_CA_CHUA_ID,
  qualityGradeId: QUALITY_GRADE_1_ID,
  qualityGradeName: "Loại 1",
  quantity: { valueScaled: 10_000, unit: "kg" as const },
  sourceType: "purchase_receipt" as const,
  sourceId: crypto.randomUUID(),
  sourceLineId: crypto.randomUUID(),
  reversalOfMovementId: null,
  reasonCode: null,
  reason: null,
  transactionTime: "2026-08-01T08:00:00.000Z" as const,
  recordedAt: "2026-08-01T08:00:00.000Z" as const,
  actorId: ACTOR_ID,
  commandId: crypto.randomUUID() as CommandId,
  ...overrides,
});

describe("inventory movement targeted reads", () => {
  it("reads receipt lineage and stocktake ids without loading a product timeline", async () => {
    const store = emptyStore();
    const repo = createInventoryRepositories(store, sequentialIdGenerator()).inventoryMovements;
    const receiptId = crypto.randomUUID();
    const receiptLine = await repo.append([
      movement({ sourceId: receiptId, quantity: { valueScaled: 10_000, unit: "kg" } }),
    ]);
    await repo.append(
      Array.from({ length: 50 }, () =>
        movement({ sourceType: "inventory_adjustment", quantity: { valueScaled: 1, unit: "kg" } }),
      ),
    );

    expect(await repo.listBySource(WORKSPACE_ID, "purchase_receipt", receiptId)).toEqual(
      receiptLine,
    );
    expect(await repo.listByIds(WORKSPACE_ID, [receiptLine[0]!.id])).toEqual(receiptLine);
    expect(await repo.listByIds(OTHER_WORKSPACE_ID, [receiptLine[0]!.id])).toEqual([]);
  });

  it("aggregates exact grade and unit scopes as of the stocktake time", async () => {
    const store = emptyStore();
    const repo = createInventoryRepositories(store, sequentialIdGenerator()).inventoryMovements;
    await repo.append([
      movement({ quantity: { valueScaled: 10_000, unit: "kg" } }),
      movement({
        quantity: { valueScaled: 5_000, unit: "kg" },
        transactionTime: "2026-08-03T08:00:00.000Z",
        recordedAt: "2026-08-03T08:00:00.000Z",
      }),
      movement({
        qualityGradeId: null,
        qualityGradeName: null,
        quantity: { valueScaled: 90_000, unit: "kg" },
      }),
    ]);

    await expect(
      repo.aggregateByScopesAsOf(
        WORKSPACE_ID,
        [
          {
            productId: PRODUCT_CA_CHUA_ID as ProductId,
            qualityGradeId: QUALITY_GRADE_1_ID as QualityGradeId,
            unit: "kg",
          },
        ],
        "2026-08-02T00:00:00.000Z",
      ),
    ).resolves.toEqual([
      {
        productId: PRODUCT_CA_CHUA_ID,
        qualityGradeId: QUALITY_GRADE_1_ID,
        unit: "kg",
        quantityScaled: 10_000,
      },
    ]);
  });
});
