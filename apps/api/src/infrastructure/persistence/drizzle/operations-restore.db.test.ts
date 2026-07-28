import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type { ProductId, SaleId, WorkspaceBackupV1 } from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import { createProduct } from "../../../modules/product/product.handlers.ts";
import { createSaleDraft } from "../../../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../../../modules/sale/post-sale.handler.ts";
import { recordCustomerPayment } from "../../../modules/payment/record-payment.handler.ts";
import {
  backupDigest,
  exportWorkspaceBackup,
  getWorkspaceIntegrity,
} from "../../../modules/operations/operations.queries.ts";
import { restoreWorkspaceBackup } from "../../../modules/operations/restore-workspace.handler.ts";
import { getAccountReconciliation } from "../../../modules/account/account.queries.ts";

describe.skipIf(skipWithoutDatabase())("M14 PostgreSQL logical recovery", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;

  const context = (): CommandContext => ({
    deps,
    principal: { actorId: ctx.actorId, subject: ctx.subject },
  });
  const command = (label: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: `${label}-${crypto.randomUUID()}`,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt: new Date().toISOString(),
  });

  beforeEach(async () => {
    ctx = await createDbTestContext(`operations-restore-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => new Date().toISOString() as ReturnType<CommandDeps["clock"]["now"]> },
    };
  });

  afterEach(async () => {
    await ctx.close();
  });

  async function prepareCanonicalBackup(): Promise<WorkspaceBackupV1> {
    const productId = crypto.randomUUID() as ProductId;
    const saleId = crypto.randomUUID() as SaleId;
    const product = await createProduct(context(), {
      ...command("recovery-product"),
      payload: {
        productId,
        displayName: "Cải ngọt phục hồi",
        aliases: ["cai ngot"],
        preferredUnit: "kg",
      },
    });
    expect(product.ok).toBe(true);
    const draft = await createSaleDraft(context(), {
      ...command("recovery-sale-draft"),
      payload: {
        saleId,
        customerId: ctx.customerId,
        currency: "VND",
        lines: [
          {
            lineId: crypto.randomUUID(),
            productId,
            productName: "Cải ngọt phục hồi",
            quantity: { valueScaled: 2_000, unit: "kg" },
            unitPrice: { amountMinor: 20_000, currency: "VND" },
          },
        ],
        note: "Sale canonical trước phục hồi",
        dueAt: null,
        replacesSaleId: null,
      },
    });
    expect(draft.ok).toBe(true);
    const posted = await postSale(context(), {
      ...command("recovery-sale-post"),
      expectedVersion: 1,
      payload: { saleId },
    });
    expect(posted.ok).toBe(true);
    const payment = await recordCustomerPayment(context(), {
      ...command("recovery-payment"),
      payload: {
        paymentId: crypto.randomUUID(),
        customerId: ctx.customerId,
        amount: { amountMinor: 10_000, currency: "VND" },
        method: "cash",
        payerName: null,
        note: "Thanh toán trước phục hồi",
      },
    });
    expect(payment.ok).toBe(true);

    // Prove the projection is derived during recovery, never exported as truth.
    await ctx.overwriteAccountProjection({
      balanceMinor: 999_999,
      entryCount: 999,
      lastEntryTransactionTime: new Date(),
    });
    const exported = await exportWorkspaceBackup(context(), {
      ...command("recovery-export"),
      payload: {},
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error("backup export unexpectedly failed");
    return exported.value;
  }

  async function emptyRecoveryWorkspace(): Promise<void> {
    /*
     * This is disaster-recovery test arrangement, not a product mutation. The
     * production append-only triggers correctly forbid deleting ledger history;
     * a fresh recovery database simply would not contain these rows. Disabling
     * triggers on this one transaction creates that empty-database condition
     * without weakening the runtime restore path.
     */
    await ctx.database.sql.begin(async (sql) => {
      await sql`set local session_replication_role = replica`;
      await sql`delete from customer_account_balances
        where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from customer_account_entries
        where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from payment_reversals where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from payments where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from sale_voids where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from sale_lines where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from sales where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from products where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from customers where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from audit_logs where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from command_receipts where workspace_id = ${ctx.workspaceId}::uuid`;
    });
  }

  async function canonicalCounts() {
    const rows = await ctx.database.sql`
      select
        (select count(*)::int from customers where workspace_id = ${ctx.workspaceId}::uuid)
          as customers,
        (select count(*)::int from products where workspace_id = ${ctx.workspaceId}::uuid)
          as products,
        (select count(*)::int from sales where workspace_id = ${ctx.workspaceId}::uuid)
          as sales,
        (select count(*)::int from sale_lines where workspace_id = ${ctx.workspaceId}::uuid)
          as sale_lines,
        (select count(*)::int from payments where workspace_id = ${ctx.workspaceId}::uuid)
          as payments,
        (select count(*)::int from customer_account_entries
          where workspace_id = ${ctx.workspaceId}::uuid) as account_entries,
        (select count(*)::int from audit_logs where workspace_id = ${ctx.workspaceId}::uuid)
          as audit,
        (select count(*)::int from command_receipts
          where workspace_id = ${ctx.workspaceId}::uuid) as command_receipts
    `;
    return rows[0] as Record<string, number>;
  }

  it("restores canonical history, rebuilds projections, and replays without duplicates", async () => {
    const backup = await prepareCanonicalBackup();
    expect(backup.payload.customers.length).toBeGreaterThan(0);
    expect(backup.payload.products.length).toBeGreaterThan(0);
    expect(backup.payload.sales.length).toBeGreaterThan(0);
    expect(backup.payload.payments.length).toBeGreaterThan(0);
    expect(backup.payload.accountEntries).toHaveLength(2);
    expect(backup.payload.audit.length).toBeGreaterThan(0);
    expect(backup.payload.commandReceipts.length).toBeGreaterThan(0);

    await emptyRecoveryWorkspace();
    expect(await canonicalCounts()).toMatchObject({
      customers: 0,
      products: 0,
      sales: 0,
      sale_lines: 0,
      payments: 0,
      account_entries: 0,
      audit: 0,
      command_receipts: 0,
    });

    const restoreCommand = {
      ...command("recovery-restore"),
      payload: { backup, reason: "Diễn tập phục hồi PostgreSQL" },
    };
    const restored = await restoreWorkspaceBackup(context(), restoreCommand);
    expect(restored.ok, JSON.stringify(restored)).toBe(true);
    if (!restored.ok) return;
    expect(restored.value.integrity.status).toBe("healthy");
    expect(await canonicalCounts()).toMatchObject({
      customers: backup.payload.customers.length,
      products: backup.payload.products.length,
      sales: backup.payload.sales.length,
      sale_lines: backup.payload.saleLines.length,
      payments: backup.payload.payments.length,
      account_entries: backup.payload.accountEntries.length,
      audit: backup.payload.audit.length + 1,
      command_receipts: backup.payload.commandReceipts.length + 1,
    });

    const reconciliation = await getAccountReconciliation(context(), {
      workspaceId: ctx.workspaceId,
      customerId: ctx.customerId,
    });
    expect(reconciliation.ok).toBe(true);
    if (reconciliation.ok) {
      expect(reconciliation.value.kind).toBe("consistent");
      if (reconciliation.value.kind === "consistent") {
        expect(reconciliation.value.ledger.balance.amountMinor).toBe(30_000);
        expect(reconciliation.value.projection?.balance.amountMinor).toBe(30_000);
      }
    }
    const integrity = await getWorkspaceIntegrity(context(), ctx.workspaceId);
    expect(integrity.ok && integrity.value.status).toBe("healthy");

    const beforeReplay = await canonicalCounts();
    const replay = await restoreWorkspaceBackup(context(), restoreCommand);
    expect(replay).toEqual(restored);
    expect(await canonicalCounts()).toEqual(beforeReplay);
  });

  it("rolls back every inserted row when canonical storage fails part-way", async () => {
    const backup = await prepareCanonicalBackup();
    await emptyRecoveryWorkspace();
    const duplicateCustomer = backup.payload.customers[0]!;
    const malformed: WorkspaceBackupV1 = {
      ...backup,
      payload: {
        ...backup.payload,
        customers: [...backup.payload.customers, duplicateCustomer],
      },
      digest: "",
    };
    const withDigest = { ...malformed, digest: backupDigest(malformed.payload) };

    await expect(
      restoreWorkspaceBackup(context(), {
        ...command("recovery-storage-failure"),
        payload: { backup: withDigest, reason: "Phải rollback toàn bộ" },
      }),
    ).rejects.toThrow();
    expect(await canonicalCounts()).toMatchObject({
      customers: 0,
      products: 0,
      sales: 0,
      sale_lines: 0,
      payments: 0,
      account_entries: 0,
      audit: 0,
      command_receipts: 0,
    });
  });
});
