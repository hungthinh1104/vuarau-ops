import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type {
  ProductId,
  PurchaseId,
  PurchaseLineId,
  PurchaseReceiptId,
  SaleId,
  SaleLineId,
  SupplierId,
  SupplierPaymentId,
  WorkspaceBackupV3,
  DeliveryId,
  DeliveryLineId,
  DocumentId,
  DocumentShareId,
} from "@vuarau/domain-contracts";
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
import {
  createSupplier,
  recordSupplierPayment,
} from "../../../modules/supplier/supplier.handlers.ts";
import { getSupplierReconciliation } from "../../../modules/supplier/supplier.queries.ts";
import {
  confirmPurchase,
  createPurchaseDraft,
} from "../../../modules/purchase/purchase.handlers.ts";
import { recordPurchaseReceipt } from "../../../modules/inventory/inventory.handlers.ts";
import { getInventoryReconciliation } from "../../../modules/inventory/inventory.queries.ts";
import {
  createDeliveryDraft,
  dispatchDelivery,
} from "../../../modules/delivery/delivery.handlers.ts";
import {
  createDocumentShare,
  generateDocument,
} from "../../../modules/document/document.handlers.ts";

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

  async function prepareCanonicalBackup(): Promise<WorkspaceBackupV3> {
    const productId = crypto.randomUUID() as ProductId;
    const saleId = crypto.randomUUID() as SaleId;
    const saleLineId = crypto.randomUUID() as SaleLineId;
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
            lineId: saleLineId,
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

    const supplierId = crypto.randomUUID() as SupplierId;
    const purchaseId = crypto.randomUUID() as PurchaseId;
    const purchaseLineId = crypto.randomUUID() as PurchaseLineId;
    expect(
      (
        await createSupplier(context(), {
          ...command("recovery-supplier"),
          payload: {
            supplierId,
            displayName: "Nhà vườn phục hồi",
            phone: "0909000999",
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await createPurchaseDraft(context(), {
          ...command("recovery-purchase"),
          payload: {
            purchaseId,
            supplierId,
            currency: "VND",
            lines: [
              {
                lineId: purchaseLineId,
                productId,
                productName: "Cải ngọt snapshot",
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
          ...command("recovery-purchase-confirm"),
          expectedVersion: 1,
          payload: { purchaseId },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordSupplierPayment(context(), {
          ...command("recovery-supplier-payment"),
          payload: {
            supplierPaymentId: crypto.randomUUID() as SupplierPaymentId,
            supplierId,
            amount: { amountMinor: 20_000, currency: "VND" },
            method: "cash",
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordPurchaseReceipt(context(), {
          ...command("recovery-receipt"),
          payload: {
            receiptId: crypto.randomUUID() as PurchaseReceiptId,
            purchaseId,
            lines: [
              {
                receiptLineId: crypto.randomUUID(),
                purchaseLineId,
                productId,
                quantity: { valueScaled: 10_000, unit: "kg" },
              },
            ],
            note: null,
          },
        })
      ).ok,
    ).toBe(true);

    // Prove the projection is derived during recovery, never exported as truth.
    await ctx.overwriteAccountProjection({
      balanceMinor: 999_999,
      entryCount: 999,
      lastEntryTransactionTime: new Date(),
    });
    const deliveryId = crypto.randomUUID() as DeliveryId;
    const deliveryLineId = crypto.randomUUID() as DeliveryLineId;
    expect(
      (
        await createDeliveryDraft(context(), {
          ...command("recovery-delivery"),
          payload: {
            deliveryId,
            saleId,
            lines: [
              {
                deliveryLineId,
                saleLineId,
                productId,
                quantity: { valueScaled: 1_000, unit: "kg" },
              },
            ],
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await dispatchDelivery(context(), {
          ...command("recovery-dispatch"),
          expectedVersion: 1,
          payload: { deliveryId },
        })
      ).ok,
    ).toBe(true);
    const documentId = crypto.randomUUID() as DocumentId;
    expect(
      (
        await generateDocument(context(), {
          ...command("recovery-document"),
          payload: {
            documentId,
            documentType: "delivery_note",
            sourceType: "delivery",
            sourceId: deliveryId,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await createDocumentShare(context(), {
          ...command("recovery-share"),
          payload: {
            shareId: crypto.randomUUID() as DocumentShareId,
            documentId,
            expiresAt: null,
          },
        })
      ).ok,
    ).toBe(true);
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
      await sql`delete from document_shares where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from documents where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from inventory_balances where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from inventory_movements where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from delivery_return_lines
        where return_id in (
          select id from delivery_returns where workspace_id = ${ctx.workspaceId}::uuid
        )`;
      await sql`delete from delivery_returns where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from delivery_lines where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from deliveries where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from sale_voids where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from sale_lines where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from sales where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from products where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from customers where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from audit_logs where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from command_receipts where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from purchase_receipt_reversals where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from purchase_receipt_lines where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from purchase_receipts where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from supplier_account_balances where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from supplier_account_entries where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from supplier_payment_reversals where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from supplier_payments where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from purchase_voids where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from purchase_lines where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from purchases where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from suppliers where workspace_id = ${ctx.workspaceId}::uuid`;
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
          where workspace_id = ${ctx.workspaceId}::uuid) as command_receipts,
        (select count(*)::int from suppliers where workspace_id = ${ctx.workspaceId}::uuid)
          as suppliers,
        (select count(*)::int from purchases where workspace_id = ${ctx.workspaceId}::uuid)
          as purchases,
        (select count(*)::int from supplier_account_entries
          where workspace_id = ${ctx.workspaceId}::uuid) as supplier_account_entries,
        (select count(*)::int from purchase_receipts
          where workspace_id = ${ctx.workspaceId}::uuid) as receipts,
        (select count(*)::int from inventory_movements
          where workspace_id = ${ctx.workspaceId}::uuid) as inventory_movements,
        (select count(*)::int from deliveries
          where workspace_id = ${ctx.workspaceId}::uuid) as deliveries,
        (select count(*)::int from documents
          where workspace_id = ${ctx.workspaceId}::uuid) as documents,
        (select count(*)::int from document_shares
          where workspace_id = ${ctx.workspaceId}::uuid) as document_shares
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
    expect(backup.payload.suppliers).toHaveLength(1);
    expect(backup.payload.purchases).toHaveLength(1);
    expect(backup.payload.supplierAccountEntries).toHaveLength(2);
    expect(backup.payload.receipts).toHaveLength(1);
    expect(backup.payload.inventoryMovements).toHaveLength(2);
    expect(backup.payload.deliveries).toHaveLength(1);
    expect(backup.payload.documents).toHaveLength(1);
    expect(backup.payload.documentShares).toHaveLength(1);

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
      suppliers: 0,
      purchases: 0,
      supplier_account_entries: 0,
      receipts: 0,
      inventory_movements: 0,
      deliveries: 0,
      documents: 0,
      document_shares: 0,
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
      suppliers: backup.payload.suppliers.length,
      purchases: backup.payload.purchases.length,
      supplier_account_entries: backup.payload.supplierAccountEntries.length,
      receipts: backup.payload.receipts.length,
      inventory_movements: backup.payload.inventoryMovements.length,
      deliveries: backup.payload.deliveries.length,
      documents: backup.payload.documents.length,
      document_shares: backup.payload.documentShares.length,
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
    const restoredSupplierId = backup.payload.suppliers[0]?.["id"] as SupplierId;
    const supplierReconciliation = await getSupplierReconciliation(context(), {
      workspaceId: ctx.workspaceId,
      supplierId: restoredSupplierId,
    });
    expect(supplierReconciliation.ok && supplierReconciliation.value.status).toBe("consistent");
    const inventoryReconciliation = await getInventoryReconciliation(context(), {
      workspaceId: ctx.workspaceId,
      productId: backup.payload.products[0]?.["id"] as ProductId,
      unit: "kg",
    });
    expect(inventoryReconciliation.ok && inventoryReconciliation.value.status).toBe("consistent");

    const beforeReplay = await canonicalCounts();
    const replay = await restoreWorkspaceBackup(context(), restoreCommand);
    expect(replay).toEqual(restored);
    expect(await canonicalCounts()).toEqual(beforeReplay);
  });

  it("rolls back every inserted row when canonical storage fails part-way", async () => {
    const backup = await prepareCanonicalBackup();
    await emptyRecoveryWorkspace();
    const duplicateCustomer = backup.payload.customers[0]!;
    const malformed: WorkspaceBackupV3 = {
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
      suppliers: 0,
      purchases: 0,
      supplier_account_entries: 0,
      receipts: 0,
      inventory_movements: 0,
    });
  });

  it("rejects a mismatched document snapshot before restoring any canonical row", async () => {
    const backup = await prepareCanonicalBackup();
    await emptyRecoveryWorkspace();
    const document = backup.payload.documents[0]!;
    const payload = {
      ...backup.payload,
      documents: [
        {
          ...document,
          snapshot: { tampered: true },
        },
      ],
    };
    const tampered: WorkspaceBackupV3 = {
      ...backup,
      payload,
      digest: backupDigest(payload),
    };

    const restored = await restoreWorkspaceBackup(context(), {
      ...command("recovery-document-digest"),
      payload: { backup: tampered, reason: "Snapshot sai digest phải bị từ chối" },
    });
    expect(restored.ok).toBe(false);
    if (!restored.ok) expect(restored.error.code).toBe("BACKUP_INTEGRITY_ERROR");
    expect(await canonicalCounts()).toMatchObject({
      customers: 0,
      products: 0,
      sales: 0,
      sale_lines: 0,
      payments: 0,
      account_entries: 0,
      audit: 0,
      command_receipts: 0,
      suppliers: 0,
      purchases: 0,
      supplier_account_entries: 0,
      receipts: 0,
      inventory_movements: 0,
      deliveries: 0,
      documents: 0,
      document_shares: 0,
    });
  });
});
