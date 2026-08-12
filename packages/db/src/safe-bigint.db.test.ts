import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { IsoInstant } from "@vuarau/domain-contracts";
import {
  PersistedNumberOutOfRangeError,
  createRepositories,
  createDbTestContext,
  skipWithoutDatabase,
} from "./index.ts";
import { persistedBigintToSafeNumber } from "./schema/safe-bigint.ts";
import {
  inventoryBalances,
  products,
  purchaseLines,
  purchases,
  suppliers,
} from "./schema/index.ts";
import { readProductCoverage } from "./repositories/read/product-coverage.ts";
import { createDashboardReadRepositories } from "./repositories/read/dashboard.ts";

function findPersistedRangeError(error: unknown): PersistedNumberOutOfRangeError | null {
  let current: unknown = error;
  while (current instanceof Error) {
    if (current instanceof PersistedNumberOutOfRangeError) return current;
    current = current.cause;
  }
  return null;
}

describe.skipIf(skipWithoutDatabase())(
  "BR-OPS-009 / TC-OPS-020 — safe persisted bigint boundaries",
  () => {
    let ctx: Awaited<ReturnType<typeof createDbTestContext>>;

    beforeAll(async () => {
      ctx = await createDbTestContext(`safe-bigint-${crypto.randomUUID()}`);
    });

    afterAll(async () => {
      await ctx?.close();
    });

    it("accepts both exact safe integer boundaries and rejects both sides", () => {
      expect(persistedBigintToSafeNumber(BigInt(Number.MAX_SAFE_INTEGER), "max")).toBe(
        Number.MAX_SAFE_INTEGER,
      );
      expect(persistedBigintToSafeNumber(BigInt(Number.MIN_SAFE_INTEGER), "min")).toBe(
        Number.MIN_SAFE_INTEGER,
      );
      expect(() =>
        persistedBigintToSafeNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n, "positive"),
      ).toThrow(PersistedNumberOutOfRangeError);
      expect(() =>
        persistedBigintToSafeNumber(BigInt(Number.MIN_SAFE_INTEGER) - 1n, "negative"),
      ).toThrow(PersistedNumberOutOfRangeError);
    });

    it("rejects an unsafe Drizzle column read without rounding", async () => {
      const productId = ctx.productIds[0]!;
      await ctx.database.db.execute(sql`
      update products
      set default_unit_price_minor = 9007199254740991
      where id = ${productId}
    `);

      const safeRows = await ctx.database.db
        .select({ value: products.defaultUnitPriceMinor })
        .from(products)
        .where(eq(products.id, productId));
      expect(safeRows[0]?.value).toBe(Number.MAX_SAFE_INTEGER);

      await ctx.database.db.execute(sql`
      update products
      set default_unit_price_minor = 9007199254740992
      where id = ${productId}
    `);

      let caught: unknown;
      try {
        await ctx.database.db
          .select({ value: products.defaultUnitPriceMinor })
          .from(products)
          .where(eq(products.id, productId));
      } catch (error) {
        caught = error;
      }
      // postgres.js parses int8 before Drizzle's column mapper, so the controlled
      // boundary intentionally reports the generic driver field here. The API
      // adds the request id and never exposes the rejected value.
      expect(findPersistedRangeError(caught)?.field).toBe("postgres.bigint");
    });

    it("rejects unsafe raw SQL aggregates before a caller can observe a rounded value", async () => {
      let caught: unknown;
      try {
        await ctx.database.db.execute(sql`select 9007199254740992::bigint as value`);
      } catch (error) {
        caught = error;
      }
      expect(findPersistedRangeError(caught)?.field).toBe("postgres.bigint");
    });

    it("rejects an aggregate overflow without mutating the existing inventory balance", async () => {
      const productId = ctx.productIds[0]!;
      const now = new Date();
      await ctx.database.db.insert(inventoryBalances).values({
        workspaceId: ctx.workspaceId,
        productId,
        qualityGradeId: null,
        unit: "kg",
        quantityScaled: Number.MAX_SAFE_INTEGER,
        movementCount: 1,
        lastMovementTransactionTime: now,
        updatedAt: now,
      });

      const ids = { newId: () => crypto.randomUUID() };
      await expect(
        ctx.database.db.transaction(async (tx) => {
          const repositories = createRepositories(tx as never, ids);
          await repositories.inventoryBalances.applyDelta({
            workspaceId: ctx.workspaceId,
            productId,
            qualityGradeId: null,
            unit: "kg",
            quantityScaled: 1,
            movementCount: 1,
            lastMovementTransactionTime: now.toISOString() as IsoInstant,
            updatedAt: now.toISOString() as IsoInstant,
          });
        }),
      ).rejects.toMatchObject({
        name: "PersistedNumberOutOfRangeError",
        code: "PERSISTED_NUMBER_OUT_OF_RANGE",
        field: "inventory_balances.quantity_scaled",
      });

      const rows = await ctx.database.db.execute(sql`
        select quantity_scaled::text as quantity_scaled
        from inventory_balances
        where workspace_id = ${ctx.workspaceId}
          and product_id = ${productId}
          and quality_grade_id is null
          and unit = 'kg'
      `);
      expect(rows[0]?.["quantity_scaled"]).toBe(String(Number.MAX_SAFE_INTEGER));
    });

    it("rejects an unsafe rebuild balance before persistence", async () => {
      const productId = ctx.productIds[1]!;
      const now = new Date();
      const ids = { newId: () => crypto.randomUUID() };

      await expect(
        ctx.database.db.transaction(async (tx) => {
          const repositories = createRepositories(tx as never, ids);
          await repositories.inventoryBalances.save({
            workspaceId: ctx.workspaceId,
            productId,
            qualityGradeId: null,
            unit: "kg",
            quantityScaled: Number.MAX_SAFE_INTEGER + 1,
            movementCount: 1,
            lastMovementTransactionTime: now.toISOString() as IsoInstant,
            updatedAt: now.toISOString() as IsoInstant,
          });
        }),
      ).rejects.toMatchObject({
        name: "PersistedNumberOutOfRangeError",
        code: "PERSISTED_NUMBER_OUT_OF_RANGE",
        field: "inventory_balances.quantity_scaled",
      });

      const rows = await ctx.database.db.execute(sql`
        select 1
        from inventory_balances
        where workspace_id = ${ctx.workspaceId}
          and product_id = ${productId}
          and quality_grade_id is null
          and unit = 'kg'
      `);
      expect(rows).toHaveLength(0);
    });

    it("keeps dashboard quantity aggregates exact and fails closed beyond the DTO range", async () => {
      const productId = ctx.productIds[1]!;
      const now = new Date();
      await ctx.database.db.insert(inventoryBalances).values({
        workspaceId: ctx.workspaceId,
        productId,
        qualityGradeId: null,
        unit: "kg",
        quantityScaled: Number.MAX_SAFE_INTEGER,
        movementCount: 1,
        lastMovementTransactionTime: now,
        updatedAt: now,
      });

      await expect(
        createDashboardReadRepositories(ctx.database.db as never).dashboardReads.summary(
          ctx.workspaceId,
        ),
      ).rejects.toMatchObject({
        name: "PersistedNumberOutOfRangeError",
        code: "PERSISTED_NUMBER_OUT_OF_RANGE",
        field: "dashboard value",
      });
    });

    it("maps ProductCoverage aggregate overflow to the controlled numeric boundary", async () => {
      const productId = ctx.productIds[2]!;
      const supplierId = crypto.randomUUID();
      const purchaseId = crypto.randomUUID();
      const purchaseLineId = crypto.randomUUID();
      const now = new Date();

      await ctx.database.db.insert(suppliers).values({
        id: supplierId,
        workspaceId: ctx.workspaceId,
        displayName: "Nhà cung cấp kiểm tra biên số",
        phone: null,
        note: null,
        isActive: true,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.database.db.insert(purchases).values({
        id: purchaseId,
        workspaceId: ctx.workspaceId,
        supplierId,
        status: "confirmed",
        currency: "VND",
        totalAmountMinor: Number.MAX_SAFE_INTEGER,
        note: null,
        evidenceReferences: [],
        dueAt: null,
        version: 2,
        transactionTime: now,
        recordedAt: now,
        confirmedAt: now,
        discardedAt: null,
        replacesPurchaseId: null,
      });
      await ctx.database.db.insert(purchaseLines).values({
        id: purchaseLineId,
        workspaceId: ctx.workspaceId,
        purchaseId,
        productId,
        productName: "Ớt hiểm",
        quantityScaled: Number.MAX_SAFE_INTEGER,
        unit: "kg",
        unitPriceMinor: 1,
        lineTotalMinor: Number.MAX_SAFE_INTEGER,
        currency: "VND",
      });
      await ctx.database.db.insert(inventoryBalances).values({
        workspaceId: ctx.workspaceId,
        productId,
        qualityGradeId: null,
        unit: "kg",
        quantityScaled: Number.MAX_SAFE_INTEGER,
        movementCount: 1,
        lastMovementTransactionTime: now,
        updatedAt: now,
      });

      await expect(
        ctx.database.db.transaction((tx) =>
          readProductCoverage(tx as never, ctx.workspaceId, [productId]),
        ),
      ).rejects.toMatchObject({
        name: "PersistedNumberOutOfRangeError",
        code: "PERSISTED_NUMBER_OUT_OF_RANGE",
        field: "product_coverage.available_after_commitments",
      });
    });
  },
);
