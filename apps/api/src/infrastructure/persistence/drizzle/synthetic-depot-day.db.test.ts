import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type {
  DeliveryId,
  DeliveryLineId,
  DeliveryReturnId,
  PaymentId,
  PaymentReversalId,
  ProductId,
  PurchaseId,
  PurchaseLineId,
  PurchaseReceiptId,
  PurchaseReceiptLineId,
  SaleId,
  SaleLineId,
  SupplierId,
  SupplierPaymentId,
} from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
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
import {
  getInventoryReconciliation,
  getProductCoverage,
  getPurchaseReceivingSummary,
} from "../../../modules/inventory/inventory.queries.ts";
import { createSaleDraft } from "../../../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../../../modules/sale/post-sale.handler.ts";
import {
  createDeliveryDraft,
  dispatchDelivery,
  markDeliveryDelivered,
  recordDeliveryReturn,
} from "../../../modules/delivery/delivery.handlers.ts";
import { getSaleFulfilment } from "../../../modules/delivery/delivery.queries.ts";
import { recordCustomerPayment } from "../../../modules/payment/record-payment.handler.ts";
import { reverseCustomerPayment } from "../../../modules/payment/reverse-payment.handler.ts";
import {
  getAccountReconciliation,
  getCustomerAccountBalance,
} from "../../../modules/account/account.queries.ts";
import { getOperationalReport } from "../../../modules/report/report.queries.ts";
import { getOperationsBoard } from "../../../modules/dashboard/dashboard.queries.ts";
import {
  exportWorkspaceBackup,
  getWorkspaceIntegrity,
} from "../../../modules/operations/operations.queries.ts";
import { restoreWorkspaceBackup } from "../../../modules/operations/restore-workspace.handler.ts";

describe.skipIf(skipWithoutDatabase())("canonical synthetic depot day against PostgreSQL", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;
  let sequence = 0;

  const context = (_workspaceId = ctx.workspaceId): CommandContext => ({
    deps,
    principal: { actorId: ctx.actorId, subject: ctx.subject },
  });

  const command = (label: string, workspaceId = ctx.workspaceId) => {
    sequence += 1;
    return {
      commandId: crypto.randomUUID(),
      idempotencyKey: `synthetic-day-${sequence}-${label}`,
      workspaceId,
      actorId: ctx.actorId,
      occurredAt: "2026-07-29T12:00:00.000Z",
    };
  };

  beforeEach(async () => {
    ctx = await createDbTestContext(`synthetic-day-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => "2026-07-29T12:00:00.000Z" as never },
    };
    sequence = 0;
  });

  afterEach(async () => ctx.close());

  it("TC-OPS-021 — keeps one workspace reconciled across the canonical money and goods loop", async () => {
    const productId = ctx.productIds[0] as ProductId;
    const supplierId = crypto.randomUUID() as SupplierId;
    const purchaseId = crypto.randomUUID() as PurchaseId;
    const purchaseLineId = crypto.randomUUID() as PurchaseLineId;
    const receiptLine = () => crypto.randomUUID() as PurchaseReceiptLineId;
    const saleId = crypto.randomUUID() as SaleId;
    const saleLineId = crypto.randomUUID() as SaleLineId;

    expect(
      (
        await createSupplier(context(), {
          ...command("supplier"),
          payload: { supplierId, displayName: "Nhà vườn synthetic", phone: null, note: null },
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
                productId,
                productName: "Cà chua",
                quantity: { valueScaled: 100_000, unit: "kg" },
                unitPrice: { amountMinor: 10_000, currency: "VND" },
              },
            ],
            note: null,
            dueAt: null,
            replacesPurchaseId: null,
          },
        })
      ).ok,
    ).toBe(true);

    const confirm = {
      ...command("purchase-confirm"),
      expectedVersion: 1,
      payload: { purchaseId },
    };
    const confirmed = await confirmPurchase(context(), confirm);
    expect(confirmed.ok).toBe(true);
    expect(await confirmPurchase(context(), confirm)).toEqual(confirmed);

    const firstReceipt = await recordPurchaseReceipt(context(), {
      ...command("receipt-one"),
      payload: {
        receiptId: crypto.randomUUID() as PurchaseReceiptId,
        purchaseId,
        lines: [
          {
            receiptLineId: receiptLine(),
            purchaseLineId,
            productId,
            qualityGradeId: ctx.qualityGradeId,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 60_000, unit: "kg" },
          },
        ],
        note: "Nhận đợt một",
      },
    });
    expect(firstReceipt.ok).toBe(true);
    const secondReceipt = await recordPurchaseReceipt(context(), {
      ...command("receipt-two"),
      payload: {
        receiptId: crypto.randomUUID() as PurchaseReceiptId,
        purchaseId,
        lines: [
          {
            receiptLineId: receiptLine(),
            purchaseLineId,
            productId,
            qualityGradeId: ctx.qualityGradeId,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 40_000, unit: "kg" },
          },
        ],
        note: "Nhận đủ phần còn lại",
      },
    });
    expect(secondReceipt.ok).toBe(true);

    const receiving = await getPurchaseReceivingSummary(context(), {
      workspaceId: ctx.workspaceId,
      purchaseId,
    });
    expect(receiving.ok && receiving.value.lines[0]?.remaining.valueScaled).toBe(0);

    expect(
      (
        await createSaleDraft(context(), {
          ...command("sale-draft"),
          payload: {
            saleId,
            customerId: ctx.customerId,
            currency: "VND",
            lines: [
              {
                lineId: saleLineId,
                productId,
                productName: "Cà chua",
                qualityGradeId: ctx.qualityGradeId,
                qualityGradeName: "Loại 1",
                quantity: { valueScaled: 30_000, unit: "kg" },
                unitPrice: { amountMinor: 20_000, currency: "VND" },
              },
            ],
            note: null,
            dueAt: null,
            replacesSaleId: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await postSale(context(), {
          ...command("sale-post"),
          expectedVersion: 1,
          payload: { saleId },
        })
      ).ok,
    ).toBe(true);

    const deliveries = [
      {
        id: crypto.randomUUID() as DeliveryId,
        lineId: crypto.randomUUID() as DeliveryLineId,
        quantity: 20_000,
      },
      {
        id: crypto.randomUUID() as DeliveryId,
        lineId: crypto.randomUUID() as DeliveryLineId,
        quantity: 10_000,
      },
    ];
    for (const [index, delivery] of deliveries.entries()) {
      expect(
        (
          await createDeliveryDraft(context(), {
            ...command(`delivery-draft-${index}`),
            payload: {
              deliveryId: delivery.id,
              saleId,
              lines: [
                {
                  deliveryLineId: delivery.lineId,
                  saleLineId,
                  productId,
                  qualityGradeId: ctx.qualityGradeId,
                  quantity: { valueScaled: delivery.quantity, unit: "kg" },
                },
              ],
              note: null,
            },
          })
        ).ok,
      ).toBe(true);
      const dispatch = {
        ...command(`delivery-dispatch-${index}`),
        expectedVersion: 1,
        payload: { deliveryId: delivery.id },
      };
      const dispatched = await dispatchDelivery(context(), dispatch);
      expect(dispatched.ok).toBe(true);
      if (index === 0) expect(await dispatchDelivery(context(), dispatch)).toEqual(dispatched);
      expect(
        (
          await markDeliveryDelivered(context(), {
            ...command(`delivery-delivered-${index}`),
            expectedVersion: 2,
            payload: { deliveryId: delivery.id },
          })
        ).ok,
      ).toBe(true);
    }
    expect(
      (
        await recordDeliveryReturn(context(), {
          ...command("delivery-return"),
          payload: {
            returnId: crypto.randomUUID() as DeliveryReturnId,
            deliveryId: deliveries[0]!.id,
            lines: [
              {
                deliveryLineId: deliveries[0]!.lineId,
                quantity: { valueScaled: 5_000, unit: "kg" },
              },
            ],
            reason: "Khách trả một phần hàng",
          },
        })
      ).ok,
    ).toBe(true);

    const paymentId = crypto.randomUUID() as PaymentId;
    expect(
      (
        await recordCustomerPayment(context(), {
          ...command("customer-payment"),
          payload: {
            paymentId,
            customerId: ctx.customerId,
            amount: { amountMinor: 300_000, currency: "VND" },
            method: "cash",
            payerName: null,
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await reverseCustomerPayment(context(), {
          ...command("customer-payment-reversal"),
          expectedVersion: 1,
          payload: {
            paymentId,
            reversalId: crypto.randomUUID() as PaymentReversalId,
            amount: { amountMinor: 50_000, currency: "VND" },
            cashAccountId: null,
            reason: "Điều chỉnh một phần khoản thu",
          },
        })
      ).ok,
    ).toBe(true);
    const supplierPaymentId = crypto.randomUUID() as SupplierPaymentId;
    expect(
      (
        await recordSupplierPayment(context(), {
          ...command("supplier-payment"),
          payload: {
            supplierPaymentId,
            supplierId,
            amount: { amountMinor: 400_000, currency: "VND" },
            method: "cash",
            note: null,
          },
        })
      ).ok,
    ).toBe(true);

    const fulfilment = await getSaleFulfilment(context(), { workspaceId: ctx.workspaceId, saleId });
    expect(fulfilment.ok && fulfilment.value.lines[0]).toMatchObject({
      netFulfilled: { valueScaled: 25_000, unit: "kg" },
      remaining: { valueScaled: 5_000, unit: "kg" },
    });
    const coverage = await getProductCoverage(context(), {
      workspaceId: ctx.workspaceId,
      productIds: [productId],
    });
    expect(coverage.ok && coverage.value[0]?.quantities).toEqual([
      expect.objectContaining({
        unit: "kg",
        qualityGradeId: null,
        qualityGradeName: null,
        onHand: { valueScaled: 0, unit: "kg" },
        inboundRemaining: { valueScaled: 0, unit: "kg" },
        outboundRemaining: { valueScaled: 0, unit: "kg" },
        availableAfterCommitments: { valueScaled: 0, unit: "kg" },
      }),
      expect.objectContaining({
        unit: "kg",
        qualityGradeId: ctx.qualityGradeId,
        qualityGradeName: "Loại 1",
        onHand: { valueScaled: 75_000, unit: "kg" },
        inboundRemaining: { valueScaled: 0, unit: "kg" },
        outboundRemaining: { valueScaled: 5_000, unit: "kg" },
        availableAfterCommitments: { valueScaled: 70_000, unit: "kg" },
      }),
    ]);
    expect(
      (
        await getInventoryReconciliation(context(), {
          workspaceId: ctx.workspaceId,
          productId,
          qualityGradeId: ctx.qualityGradeId,
          unit: "kg",
        })
      ).ok,
    ).toBe(true);
    expect((await getCustomerAccountBalance(context(), ctx.workspaceId, ctx.customerId)).ok).toBe(
      true,
    );
    expect(
      (
        await getAccountReconciliation(context(), {
          workspaceId: ctx.workspaceId,
          customerId: ctx.customerId,
        })
      ).ok,
    ).toBe(true);
    const supplierReconciliation = await getSupplierReconciliation(context(), {
      workspaceId: ctx.workspaceId,
      supplierId,
    });
    expect(supplierReconciliation.ok && supplierReconciliation.value.status).toBe("consistent");
    expect(
      (
        await getOperationalReport(context(), {
          workspaceId: ctx.workspaceId,
          reportType: "outstanding_delivery",
          businessDate: null,
          productId,
          unit: "kg",
          cursor: null,
          limit: 20,
        })
      ).ok,
    ).toBe(true);
    const board = await getOperationsBoard(context(), {
      workspaceId: ctx.workspaceId,
      filter: "all",
      sort: "updated_desc",
      search: "",
      cursor: null,
      limit: 20,
    });
    expect(board.ok && board.value.page.items.some((row) => row.id === saleId)).toBe(true);

    const backup = await exportWorkspaceBackup(context(), {
      ...command("backup"),
      payload: {},
    });
    expect(backup.ok).toBe(true);
    if (!backup.ok) return;

    /*
     * Recovery arrangement only: a real empty target database would contain
     * no canonical rows. Temporarily disabling append-only triggers in this
     * test transaction models that empty target without adding a production
     * delete path.
     */
    await ctx.database.sql.begin(async (sql) => {
      await sql`set local session_replication_role = replica`;
      await sql`delete from customer_account_balances where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from customer_account_entries where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from payment_allocation_reversals where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from payment_allocations where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from payment_reversals where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from payments where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from delivery_return_lines where return_id in (select id from delivery_returns where workspace_id = ${ctx.workspaceId}::uuid)`;
      await sql`delete from delivery_returns where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from delivery_lines where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from deliveries where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from sale_lines where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from sales where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from inventory_balances where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from inventory_movements where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from purchase_receipt_lines where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from purchase_receipts where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from supplier_account_balances where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from supplier_account_entries where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from supplier_payment_reversals where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from supplier_payments where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from purchase_lines where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from purchases where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from suppliers where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from products where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from quality_grades where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from customers where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from audit_logs where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from workspace_change_feed where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from command_receipts where workspace_id = ${ctx.workspaceId}::uuid`;
    });
    const restored = await restoreWorkspaceBackup(context(), {
      ...command("restore"),
      payload: { backup: backup.value, reason: "Diễn tập phục hồi cùng ngày" },
    });
    expect(restored.ok, JSON.stringify(restored)).toBe(true);
    if (!restored.ok) return;
    expect(restored.value.integrity.status).toBe("healthy");
    const targetIntegrity = await getWorkspaceIntegrity(context(), ctx.workspaceId);
    expect(targetIntegrity.ok && targetIntegrity.value.status).toBe("healthy");
    expect(
      (
        await getAccountReconciliation(context(), {
          workspaceId: ctx.workspaceId,
          customerId: ctx.customerId,
        })
      ).ok,
    ).toBe(true);
  });
});
