import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type {
  PurchaseId,
  PurchaseLineId,
  PurchaseReceiptId,
  SupplierId,
  WorkspaceBackupV19,
} from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import { createSupplier } from "../../../modules/supplier/supplier.handlers.ts";
import {
  confirmPurchase,
  createPurchaseDraft,
} from "../../../modules/purchase/purchase.handlers.ts";
import { recordPurchaseReceipt } from "../../../modules/inventory/inventory.handlers.ts";
import {
  backupDigest,
  exportWorkspaceBackup,
} from "../../../modules/operations/operations.queries.ts";
import { restoreWorkspaceBackup } from "../../../modules/operations/restore-workspace.handler.ts";

describe.skipIf(skipWithoutDatabase())("PostgreSQL restore purchase lineage", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;

  const context = (): CommandContext => ({
    deps,
    principal: { actorId: ctx.actorId, subject: ctx.subject },
  });
  const command = (label: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: `restore-purchase-lineage-${label}-${crypto.randomUUID()}`,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt: "2026-08-11T05:00:00.000Z",
  });

  beforeEach(async () => {
    ctx = await createDbTestContext(`restore-purchase-lineage-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => "2026-08-11T11:00:00.000Z" as never },
    };
  });

  afterEach(async () => {
    await ctx.close();
  });

  async function prepareBackup(): Promise<WorkspaceBackupV19> {
    const supplierId = crypto.randomUUID() as SupplierId;
    const purchaseId = crypto.randomUUID() as PurchaseId;
    const purchaseLineId = crypto.randomUUID() as PurchaseLineId;
    expect(
      (
        await createSupplier(context(), {
          ...command("supplier"),
          payload: {
            supplierId,
            displayName: "Nhà vườn lineage",
            phone: null,
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await createPurchaseDraft(context(), {
          ...command("purchase-draft"),
          payload: {
            purchaseId,
            supplierId,
            currency: "VND",
            lines: [
              {
                lineId: purchaseLineId,
                productId: ctx.productIds[0],
                productName: "Cà chua",
                quantity: { valueScaled: 10_000, unit: "kg" },
                unitPrice: { amountMinor: 5_000, currency: "VND" },
              },
            ],
            note: null,
            dueAt: null,
            replacesPurchaseId: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await confirmPurchase(context(), {
          ...command("purchase-confirm"),
          expectedVersion: 1,
          payload: { purchaseId },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordPurchaseReceipt(context(), {
          ...command("receipt"),
          payload: {
            receiptId: crypto.randomUUID() as PurchaseReceiptId,
            purchaseId,
            lines: [
              {
                receiptLineId: crypto.randomUUID(),
                purchaseLineId,
                productId: ctx.productIds[0],
                qualityGradeId: ctx.qualityGradeId,
                qualityGradeName: "Loại 1",
                quantity: { valueScaled: 1_000, unit: "kg" },
              },
            ],
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    const exported = await exportWorkspaceBackup(context(), {
      ...command("export"),
      payload: {},
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error("backup export unexpectedly failed");
    return exported.value;
  }

  async function emptyWorkspace(): Promise<void> {
    await ctx.database.sql.begin(async (sql) => {
      await sql`set local session_replication_role = replica`;
      for (const table of [
        "customer_account_balances",
        "customer_account_entries",
        "payment_reversals",
        "payments",
        "document_shares",
        "documents",
        "inventory_balances",
        "inventory_movements",
        "delivery_return_lines",
        "delivery_returns",
        "delivery_lines",
        "deliveries",
        "sale_lines",
        "sales",
        "products",
        "quality_grades",
        "customers",
        "audit_logs",
        "reconciliation_observations",
        "workspace_policies",
        "cost_observations",
        "command_receipts",
        "purchase_receipt_reversals",
        "purchase_receipt_lines",
        "purchase_receipts",
        "price_rules",
        "supplier_account_balances",
        "supplier_account_entries",
        "supplier_payment_reversals",
        "supplier_payments",
        "purchase_voids",
        "purchase_lines",
        "purchases",
        "suppliers",
      ] as const) {
        await sql.unsafe(`delete from ${table} where workspace_id = '${ctx.workspaceId}'`);
      }
    });
  }

  // TC-OPS-006
  it("rejects a receipt line whose purchase lineage does not match", async () => {
    const backup = await prepareBackup();
    await emptyWorkspace();
    const purchase = backup.payload.purchases[0]!;
    const purchaseLine = backup.payload.purchaseLines[0]!;
    const receipt = backup.payload.receipts[0]!;
    const receiptLine = backup.payload.receiptLines[0]!;
    const clonedPurchaseId = crypto.randomUUID();
    const clonedPurchaseLineId = crypto.randomUUID();
    const clonedReceiptId = crypto.randomUUID();
    const clonedReceiptLineId = crypto.randomUUID();
    const payload = {
      ...backup.payload,
      purchases: [...backup.payload.purchases, { ...purchase, id: clonedPurchaseId }],
      purchaseLines: [
        ...backup.payload.purchaseLines,
        { ...purchaseLine, id: clonedPurchaseLineId, purchaseId: clonedPurchaseId },
      ],
      receipts: [
        ...backup.payload.receipts,
        { ...receipt, id: clonedReceiptId, purchaseId: clonedPurchaseId },
      ],
      receiptLines: [
        ...backup.payload.receiptLines,
        {
          ...receiptLine,
          id: clonedReceiptLineId,
          receiptId: clonedReceiptId,
          purchaseLineId: clonedPurchaseLineId,
        },
      ],
    };
    const malformedPayload = {
      ...payload,
      receiptLines: payload.receiptLines.map((row) =>
        row["id"] === clonedReceiptLineId ? { ...row, purchaseLineId: purchaseLine["id"] } : row,
      ),
    };
    const count = (key: string) => Number(backup.recordCounts[key] ?? 0) + 1;
    const malformed: WorkspaceBackupV19 = {
      ...backup,
      payload: malformedPayload,
      recordCounts: {
        ...backup.recordCounts,
        purchases: count("purchases"),
        purchaseLines: count("purchaseLines"),
        receipts: count("receipts"),
        receiptLines: count("receiptLines"),
      },
      digest: backupDigest(malformedPayload),
    };
    const restored = await restoreWorkspaceBackup(context(), {
      ...command("receipt-line-lineage"),
      payload: { backup: malformed, reason: "Receipt line phải cùng purchase." },
    });
    expect(restored.ok).toBe(false);
    if (!restored.ok) expect(restored.error.code).toBe("BACKUP_INTEGRITY_ERROR");
    const counts = await ctx.database.sql`
      select
        (select count(*)::int from purchases where workspace_id = ${ctx.workspaceId}::uuid) as purchases,
        (select count(*)::int from purchase_receipts where workspace_id = ${ctx.workspaceId}::uuid) as receipts,
        (select count(*)::int from inventory_movements where workspace_id = ${ctx.workspaceId}::uuid) as movements
    `;
    expect(counts[0]).toMatchObject({ purchases: 0, receipts: 0, movements: 0 });
  });
});
