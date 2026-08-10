import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  PersistedNumberOutOfRangeError,
  createDbTestContext,
  skipWithoutDatabase,
} from "./index.ts";
import { persistedBigintToSafeNumber } from "./schema/safe-bigint.ts";
import { products } from "./schema/index.ts";

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
  },
);
