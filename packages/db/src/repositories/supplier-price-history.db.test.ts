import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupplierReadRepositories } from "./read/supplier.ts";
import { purchaseLines, purchases, suppliers } from "../schema/index.ts";
import {
  createDbTestContext,
  skipWithoutDatabase,
  type DbTestContext,
} from "../testing/db-test-context.ts";

describe.skipIf(skipWithoutDatabase())("supplier confirmed price history", () => {
  let ctx: DbTestContext;
  const supplierId = crypto.randomUUID();
  const confirmedPurchaseId = crypto.randomUUID();
  const draftPurchaseId = crypto.randomUUID();
  const confirmedLineId = crypto.randomUUID();
  const draftLineId = crypto.randomUUID();

  beforeAll(async () => {
    ctx = await createDbTestContext("supplier-price-history");
    const now = new Date("2026-07-22T01:30:00.000Z");
    await ctx.database.db.insert(suppliers).values({
      id: supplierId,
      workspaceId: ctx.workspaceId,
      displayName: "Vựa nguồn kiểm thử",
      phone: null,
      note: null,
      isActive: true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.database.db.insert(purchases).values([
      {
        id: confirmedPurchaseId,
        workspaceId: ctx.workspaceId,
        supplierId,
        status: "confirmed",
        currency: "VND",
        totalAmountMinor: 120_000,
        note: null,
        dueAt: null,
        version: 2,
        transactionTime: new Date("2026-07-22T01:00:00.000Z"),
        recordedAt: now,
        confirmedAt: now,
        discardedAt: null,
        replacesPurchaseId: null,
      },
      {
        id: draftPurchaseId,
        workspaceId: ctx.workspaceId,
        supplierId,
        status: "draft",
        currency: "VND",
        totalAmountMinor: 110_000,
        note: null,
        dueAt: null,
        version: 1,
        transactionTime: new Date("2026-07-23T01:00:00.000Z"),
        recordedAt: now,
        confirmedAt: null,
        discardedAt: null,
        replacesPurchaseId: null,
      },
    ]);
    await ctx.database.db.insert(purchaseLines).values([
      {
        id: confirmedLineId,
        workspaceId: ctx.workspaceId,
        purchaseId: confirmedPurchaseId,
        productId: ctx.productIds[0],
        productName: "Cà chua",
        quantityScaled: 10,
        unit: "kg",
        unitPriceMinor: 12_000,
        lineTotalMinor: 120_000,
        currency: "VND",
      },
      {
        id: draftLineId,
        workspaceId: ctx.workspaceId,
        purchaseId: draftPurchaseId,
        productId: ctx.productIds[0],
        productName: "Cà chua",
        quantityScaled: 10,
        unit: "kg",
        unitPriceMinor: 11_000,
        lineTotalMinor: 110_000,
        currency: "VND",
      },
    ]);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it("reads confirmed snapshots only and preserves the keyset cursor", async () => {
    const result = await ctx.database.db.transaction(async (tx) =>
      createSupplierReadRepositories(tx as never).supplierReads.priceHistory({
        workspaceId: ctx.workspaceId,
        supplierId,
        productId: ctx.productIds[0],
        page: { after: null, limit: 20 },
      }),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      purchaseId: confirmedPurchaseId,
      purchaseLineId: confirmedLineId,
      unitPrice: { amountMinor: 12_000, currency: "VND" },
    });
    expect(result.next).toBeNull();
  });
});
