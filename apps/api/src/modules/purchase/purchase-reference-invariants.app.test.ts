import { beforeEach, describe, expect, it } from "vitest";
import type { PurchaseId, PurchaseLineId } from "@vuarau/domain-contracts";
import { PRODUCT_CA_CHUA_ID, SUPPLIER_ID, WORKSPACE_ID } from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { createPurchaseDraft } from "./purchase.handlers.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

function input(label: string, productName: string) {
  const purchaseId = crypto.randomUUID() as PurchaseId;
  const lineId = crypto.randomUUID() as PurchaseLineId;
  return {
    commandId: crypto.randomUUID(),
    idempotencyKey: `purchase-reference-${label}-${crypto.randomUUID()}`,
    workspaceId: WORKSPACE_ID,
    actorId: harness.ctx.principal.actorId,
    occurredAt: "2026-07-20T05:00:00.000Z",
    payload: {
      purchaseId,
      supplierId: SUPPLIER_ID,
      currency: "VND",
      lines: [
        {
          lineId,
          productId: PRODUCT_CA_CHUA_ID,
          productName,
          quantity: { valueScaled: 100_000, unit: "kg" },
          unitPrice: { amountMinor: 10_000, currency: "VND" },
        },
      ],
      note: null,
      evidenceReferences: [],
      dueAt: null,
      replacesPurchaseId: null,
    },
  };
}

describe("Purchase master-data invariants", () => {
  it("rejects an inactive Product before creating a Purchase draft", async () => {
    await harness.db.unitOfWork().transaction(async ({ products }) => {
      const product = await products.findById(WORKSPACE_ID, PRODUCT_CA_CHUA_ID);
      if (product === null) throw new Error("seed product missing");
      expect(await products.update({ ...product, isActive: false }, product.version)).toBe(true);
    });

    const result = await createPurchaseDraft(harness.ctx, input("inactive", "Cà chua"));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PURCHASE_PRODUCT_INACTIVE");
    expect(
      harness.db.auditRecords().some((record) => record.action === "purchase.draft_created"),
    ).toBe(false);
  });

  it("rejects a Purchase line whose name no longer matches the Product snapshot", async () => {
    const result = await createPurchaseDraft(harness.ctx, input("snapshot", "Cà chua cũ"));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PURCHASE_PRODUCT_SNAPSHOT_MISMATCH");
  });
});
