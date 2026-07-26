import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { debtLedgerEntries, orders, payments } from "../schema/index.ts";
import {
  createDbTestContext,
  hasDatabase,
  type DbTestContext,
} from "../testing/db-test-context.ts";
import { captureDatabaseError } from "../testing/expect-database-error.ts";

/**
 * These assert the guarantees that live in the database itself, not in
 * application code: triggers and constraints that hold even when the caller is a
 * migration, a psql session, or a future ORM upgrade.
 */
describe.skipIf(!hasDatabase)("database append-only guarantees", () => {
  let ctx: DbTestContext;

  beforeAll(async () => {
    ctx = await createDbTestContext("append-only");
  });

  afterAll(async () => {
    await ctx?.close();
  });

  async function insertLedgerEntry(sourceId: string, amountMinor: number): Promise<string> {
    const id = crypto.randomUUID();
    await ctx.database.db.insert(debtLedgerEntries).values({
      id,
      workspaceId: ctx.workspaceId,
      customerId: ctx.customerId,
      amountMinor,
      currency: "VND",
      sourceType: "manual_adjustment",
      sourceId,
      reversalOfEntryId: null,
      reasonCode: "opening_balance",
      reason: "Nợ cũ từ sổ giấy",
      transactionTime: new Date(),
      recordedAt: new Date(),
      actorId: ctx.actorId,
      commandId: crypto.randomUUID(),
    });
    return id;
  }

  describe("BR-ACCOUNT-005 / TC-ACCOUNT-005", () => {
    it("refuses an UPDATE against a ledger entry", async () => {
      const id = await insertLedgerEntry(crypto.randomUUID(), 100_000);

      const message = await captureDatabaseError(
        ctx.database.db
          .update(debtLedgerEntries)
          .set({ amountMinor: 1 })
          .where(eq(debtLedgerEntries.id, id)),
      );
      expect(message).toMatch(/append-only/i);
    });

    it("refuses a DELETE against a ledger entry", async () => {
      const id = await insertLedgerEntry(crypto.randomUUID(), 100_000);

      const message = await captureDatabaseError(
        ctx.database.db.delete(debtLedgerEntries).where(eq(debtLedgerEntries.id, id)),
      );
      expect(message).toMatch(/append-only/i);
    });

    it("leaves the entry exactly as written after a refused mutation", async () => {
      const sourceId = crypto.randomUUID();
      const id = await insertLedgerEntry(sourceId, 250_000);

      await captureDatabaseError(
        ctx.database.db
          .update(debtLedgerEntries)
          .set({ amountMinor: 1 })
          .where(eq(debtLedgerEntries.id, id)),
      );

      const rows = await ctx.database.db
        .select()
        .from(debtLedgerEntries)
        .where(eq(debtLedgerEntries.id, id));
      expect(rows[0]?.amountMinor).toBe(250_000);
    });
  });

  describe("BR-SALE-007 / TC-SALE-012", () => {
    it("makes a second ledger entry for the same source impossible", async () => {
      // The structural backstop behind "confirming twice must not double a debt":
      // even if a code path slipped past idempotency, the constraint refuses.
      const sourceId = crypto.randomUUID();
      await insertLedgerEntry(sourceId, 100_000);

      const message = await captureDatabaseError(insertLedgerEntry(sourceId, 100_000));
      expect(message).toMatch(/duplicate key|unique/i);
    });
  });

  describe("BR-SALE-008 / TC-SALE-009", () => {
    it("refuses a DELETE against an order", async () => {
      const orderId = crypto.randomUUID();
      await ctx.database.db.insert(orders).values({
        id: orderId,
        workspaceId: ctx.workspaceId,
        customerId: ctx.customerId,
        status: "confirmed",
        currency: "VND",
        totalAmountMinor: 875_000,
        note: null,
        version: 2,
        transactionTime: new Date(),
        recordedAt: new Date(),
        confirmedAt: new Date(),
        cancelledAt: null,
      });

      const message = await captureDatabaseError(
        ctx.database.db.delete(orders).where(eq(orders.id, orderId)),
      );
      expect(message).toMatch(/never removed/i);
    });

    it("refuses a DELETE against a payment", async () => {
      const paymentId = crypto.randomUUID();
      await ctx.database.db.insert(payments).values({
        id: paymentId,
        workspaceId: ctx.workspaceId,
        customerId: ctx.customerId,
        amountMinor: 500_000,
        currency: "VND",
        method: "cash",
        payerName: null,
        note: null,
        status: "recorded",
        reversedAmountMinor: 0,
        version: 1,
        transactionTime: new Date(),
        recordedAt: new Date(),
      });

      const message = await captureDatabaseError(
        ctx.database.db.delete(payments).where(eq(payments.id, paymentId)),
      );
      expect(message).toMatch(/never removed/i);
    });

    it("still allows the status and version of a payment to change", async () => {
      // The delete-only guard must not block the domain's own writes.
      const paymentId = crypto.randomUUID();
      await ctx.database.db.insert(payments).values({
        id: paymentId,
        workspaceId: ctx.workspaceId,
        customerId: ctx.customerId,
        amountMinor: 500_000,
        currency: "VND",
        method: "cash",
        payerName: null,
        note: null,
        status: "recorded",
        reversedAmountMinor: 0,
        version: 1,
        transactionTime: new Date(),
        recordedAt: new Date(),
      });

      await ctx.database.db
        .update(payments)
        .set({ status: "partially_reversed", reversedAmountMinor: 200_000, version: 2 })
        .where(eq(payments.id, paymentId));

      const rows = await ctx.database.db.select().from(payments).where(eq(payments.id, paymentId));
      expect(rows[0]?.reversedAmountMinor).toBe(200_000);
    });
  });

  describe("migration integrity", () => {
    it("has applied both migrations", async () => {
      const applied = await ctx.database.sql`
        SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations
      `;
      expect(applied[0]?.["count"]).toBeGreaterThanOrEqual(2);
    });

    it("installed every table the slice needs", async () => {
      const rows = await ctx.database.db.execute(sql`
        SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
      `);
      const names = new Set(rows.map((row) => String(row["table_name"])));

      for (const expected of [
        "workspaces",
        "actors",
        "workspace_memberships",
        "customers",
        "products",
        "orders",
        "order_lines",
        "payments",
        "payment_reversals",
        "debt_ledger_entries",
        "customer_debt_summaries",
        "command_receipts",
        "audit_logs",
      ]) {
        expect(names.has(expected), `missing table ${expected}`).toBe(true);
      }
    });
  });
});
