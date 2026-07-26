import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { customerAccountEntries, saleLines, saleVoids, sales, payments } from "../schema/index.ts";
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

  async function insertAccountEntry(sourceId: string, amountMinor: number): Promise<string> {
    const id = crypto.randomUUID();
    await ctx.database.db.insert(customerAccountEntries).values({
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
      const id = await insertAccountEntry(crypto.randomUUID(), 100_000);

      const message = await captureDatabaseError(
        ctx.database.db
          .update(customerAccountEntries)
          .set({ amountMinor: 1 })
          .where(eq(customerAccountEntries.id, id)),
      );
      expect(message).toMatch(/append-only/i);
    });

    it("refuses a DELETE against a ledger entry", async () => {
      const id = await insertAccountEntry(crypto.randomUUID(), 100_000);

      const message = await captureDatabaseError(
        ctx.database.db.delete(customerAccountEntries).where(eq(customerAccountEntries.id, id)),
      );
      expect(message).toMatch(/append-only/i);
    });

    it("leaves the entry exactly as written after a refused mutation", async () => {
      const sourceId = crypto.randomUUID();
      const id = await insertAccountEntry(sourceId, 250_000);

      await captureDatabaseError(
        ctx.database.db
          .update(customerAccountEntries)
          .set({ amountMinor: 1 })
          .where(eq(customerAccountEntries.id, id)),
      );

      const rows = await ctx.database.db
        .select()
        .from(customerAccountEntries)
        .where(eq(customerAccountEntries.id, id));
      expect(rows[0]?.amountMinor).toBe(250_000);
    });
  });

  describe("BR-SALE-007 / TC-SALE-012", () => {
    it("makes a second ledger entry for the same source impossible", async () => {
      // The structural backstop behind "posting twice must not double a receivable":
      // even if a code path slipped past idempotency, the constraint refuses.
      const sourceId = crypto.randomUUID();
      await insertAccountEntry(sourceId, 100_000);

      const message = await captureDatabaseError(insertAccountEntry(sourceId, 100_000));
      expect(message).toMatch(/duplicate key|unique/i);
    });
  });

  describe("BR-SALE-008 / TC-SALE-009", () => {
    it("refuses a DELETE against a posted sale", async () => {
      const saleId = crypto.randomUUID();
      await ctx.database.db.insert(sales).values({
        id: saleId,
        workspaceId: ctx.workspaceId,
        customerId: ctx.customerId,
        status: "posted",
        currency: "VND",
        totalAmountMinor: 875_000,
        note: null,
        version: 2,
        transactionTime: new Date(),
        recordedAt: new Date(),
        postedAt: new Date(),
        dueAt: null,
        replacesSaleId: null,
      });

      const message = await captureDatabaseError(
        ctx.database.db.delete(sales).where(eq(sales.id, saleId)),
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
        "sales",
        "sale_lines",
        "sale_voids",
        "payments",
        "payment_reversals",
        "customer_account_entries",
        "customer_account_balances",
        "command_receipts",
        "audit_logs",
      ]) {
        expect(names.has(expected), `missing table ${expected}`).toBe(true);
      }
    });
  });

  describe("BR-SALE-008 / TC-SALE-016", () => {
    /** Inserts a posted sale directly, bypassing the domain. */
    async function insertPostedSale(): Promise<string> {
      const saleId = crypto.randomUUID();
      await ctx.database.db.insert(sales).values({
        id: saleId,
        workspaceId: ctx.workspaceId,
        customerId: ctx.customerId,
        status: "posted",
        currency: "VND",
        totalAmountMinor: 875_000,
        note: null,
        version: 2,
        transactionTime: new Date(),
        recordedAt: new Date(),
        postedAt: new Date(),
        dueAt: null,
        replacesSaleId: null,
      });
      return saleId;
    }

    it("refuses an UPDATE against a posted sale, whoever issues it", async () => {
      const saleId = await insertPostedSale();

      const message = await captureDatabaseError(
        ctx.database.db.update(sales).set({ totalAmountMinor: 1 }).where(eq(sales.id, saleId)),
      );
      expect(message).toMatch(/posted sale is immutable/i);

      const [row] = await ctx.database.db.select().from(sales).where(eq(sales.id, saleId));
      expect(row?.totalAmountMinor).toBe(875_000);
    });

    it("refuses an UPDATE against the lines of a posted sale", async () => {
      const saleId = await insertPostedSale();
      const lineId = crypto.randomUUID();
      await ctx.database.db.insert(saleLines).values({
        id: lineId,
        workspaceId: ctx.workspaceId,
        saleId,
        productId: ctx.productIds[0],
        productName: "Cà chua",
        quantityScaled: 12_500,
        unit: "kg",
        unitPriceMinor: 18_000,
        lineTotalMinor: 225_000,
        currency: "VND",
        position: 0,
      });

      const message = await captureDatabaseError(
        ctx.database.db
          .update(saleLines)
          .set({ unitPriceMinor: 1 })
          .where(eq(saleLines.id, lineId)),
      );
      expect(message).toMatch(/posted sale is immutable/i);
    });

    it("still allows a draft to be posted — the one legitimate transition", async () => {
      // The trigger fires on `OLD.status = 'posted'` only. A blanket UPDATE ban
      // would block the domain itself, which is why BR-SALE-008 is scoped to a
      // *posted* sale rather than to the table.
      const saleId = crypto.randomUUID();
      await ctx.database.db.insert(sales).values({
        id: saleId,
        workspaceId: ctx.workspaceId,
        customerId: ctx.customerId,
        status: "draft",
        currency: "VND",
        totalAmountMinor: 875_000,
        note: null,
        version: 1,
        transactionTime: new Date(),
        recordedAt: new Date(),
        postedAt: null,
        dueAt: null,
        replacesSaleId: null,
      });

      await ctx.database.db
        .update(sales)
        .set({ status: "posted", version: 2, postedAt: new Date() })
        .where(eq(sales.id, saleId));

      const [row] = await ctx.database.db.select().from(sales).where(eq(sales.id, saleId));
      expect(row?.status).toBe("posted");
    });
  });

  describe("BR-SALE-013 / TC-SALE-024", () => {
    it("makes a second void of the same sale unrepresentable", async () => {
      const saleId = crypto.randomUUID();
      await ctx.database.db.insert(sales).values({
        id: saleId,
        workspaceId: ctx.workspaceId,
        customerId: ctx.customerId,
        status: "posted",
        currency: "VND",
        totalAmountMinor: 100_000,
        note: null,
        version: 2,
        transactionTime: new Date(),
        recordedAt: new Date(),
        postedAt: new Date(),
        dueAt: null,
        replacesSaleId: null,
      });

      const insertVoid = () =>
        ctx.database.db.insert(saleVoids).values({
          id: crypto.randomUUID(),
          workspaceId: ctx.workspaceId,
          saleId,
          reasonCode: "wrong_amount",
          reason: "Ghi nhầm",
          amountMinor: 100_000,
          currency: "VND",
          transactionTime: new Date(),
          recordedAt: new Date(),
          actorId: ctx.actorId,
          commandId: crypto.randomUUID(),
        });

      await insertVoid();

      // Different void id, same sale. UNIQUE (sale_id) is what stops a customer
      // being credited twice for one mistake, even with the domain bypassed.
      const message = await captureDatabaseError(insertVoid());
      expect(message).toMatch(/duplicate key|unique/i);
    });

    it("refuses to edit or delete a void record once written", async () => {
      const saleId = crypto.randomUUID();
      await ctx.database.db.insert(sales).values({
        id: saleId,
        workspaceId: ctx.workspaceId,
        customerId: ctx.customerId,
        status: "posted",
        currency: "VND",
        totalAmountMinor: 100_000,
        note: null,
        version: 2,
        transactionTime: new Date(),
        recordedAt: new Date(),
        postedAt: new Date(),
        dueAt: null,
        replacesSaleId: null,
      });
      const voidId = crypto.randomUUID();
      await ctx.database.db.insert(saleVoids).values({
        id: voidId,
        workspaceId: ctx.workspaceId,
        saleId,
        reasonCode: "wrong_amount",
        reason: "Ghi nhầm",
        amountMinor: 100_000,
        currency: "VND",
        transactionTime: new Date(),
        recordedAt: new Date(),
        actorId: ctx.actorId,
        commandId: crypto.randomUUID(),
      });

      const updateMessage = await captureDatabaseError(
        ctx.database.db
          .update(saleVoids)
          .set({ reason: "rewritten" })
          .where(eq(saleVoids.id, voidId)),
      );
      expect(updateMessage).toMatch(/append-only/i);

      const deleteMessage = await captureDatabaseError(
        ctx.database.db.delete(saleVoids).where(eq(saleVoids.id, voidId)),
      );
      expect(deleteMessage).toMatch(/append-only/i);
    });
  });
});
