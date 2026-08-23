import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  DeliveryId,
  DeliveryLineId,
  DeliveryReturnId,
  PurchaseId,
  PurchaseLineId,
  PurchaseReceiptId,
  PurchaseReceiptLineId,
  SaleId,
  SaleLineId,
  SupplierId,
  SupplierPaymentId,
} from "@vuarau/domain-contracts";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import {
  createSupplier,
  recordSupplierPayment,
} from "../../../modules/supplier/supplier.handlers.ts";
import {
  getSupplierBalance,
  getSupplierReconciliation,
} from "../../../modules/supplier/supplier.queries.ts";
import {
  confirmPurchase,
  createPurchaseDraft,
  voidPurchase,
} from "../../../modules/purchase/purchase.handlers.ts";
import { recordPurchaseReceipt } from "../../../modules/inventory/inventory.handlers.ts";
import {
  getInventoryReconciliation,
  getPurchaseReceivingSummary,
} from "../../../modules/inventory/inventory.queries.ts";
import { createSaleDraft } from "../../../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../../../modules/sale/post-sale.handler.ts";
import { voidSale } from "../../../modules/sale/void-sale.handler.ts";
import {
  createDeliveryDraft,
  dispatchDelivery,
  recordDeliveryReturn,
} from "../../../modules/delivery/delivery.handlers.ts";
import { getSaleFulfilment } from "../../../modules/delivery/delivery.queries.ts";
import { recordCustomerPayment } from "../../../modules/payment/record-payment.handler.ts";
import {
  getAccountReconciliation,
  getCustomerAccountBalance,
} from "../../../modules/account/account.queries.ts";
import { getOperationalReport } from "../../../modules/report/report.queries.ts";

let ctx: DbTestContext;
let owner: CommandContext;
let sequence = 0;
const transactionTime = "2026-08-20T05:00:00.000+07:00";

const envelope = (label: string) => {
  sequence += 1;
  return {
    commandId: crypto.randomUUID(),
    idempotencyKey: `postgres-depot-day-${sequence}-${label}`,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt: transactionTime,
  };
};

beforeAll(async () => {
  ctx = await createDbTestContext("full-depot-day-postgres");
  const deps: CommandDeps = {
    uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
    clock: { now: () => new Date().toISOString() as ReturnType<CommandDeps["clock"]["now"]> },
  };
  owner = { deps, principal: { actorId: ctx.actorId, subject: ctx.subject } };
  sequence = 0;
});

afterAll(async () => {
  await ctx?.close();
});

describe.skipIf(skipWithoutDatabase())("full depot day against PostgreSQL", () => {
  it("TC-OPS-015 — keeps four canonical truths reconcilable through real transactions and constraints", async () => {
    const supplierId = crypto.randomUUID() as SupplierId;
    const purchaseId = crypto.randomUUID() as PurchaseId;
    const purchaseLineId = crypto.randomUUID() as PurchaseLineId;
    const receiptId = crypto.randomUUID() as PurchaseReceiptId;
    const saleId = crypto.randomUUID() as SaleId;
    const saleLineId = crypto.randomUUID() as SaleLineId;
    const deliveryId = crypto.randomUUID() as DeliveryId;
    const deliveryLineId = crypto.randomUUID() as DeliveryLineId;

    expect(
      (
        await createSupplier(owner, {
          ...envelope("supplier"),
          payload: {
            supplierId,
            displayName: "Nhà vườn rehearsal",
            phone: null,
            note: null,
          },
        })
      ).ok,
    ).toBe(true);

    expect(
      (
        await createPurchaseDraft(owner, {
          ...envelope("purchase-draft"),
          payload: {
            purchaseId,
            supplierId,
            currency: "VND",
            lines: [
              {
                lineId: purchaseLineId,
                productId: ctx.productIds[0],
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

    const confirmation = {
      ...envelope("purchase-confirm"),
      expectedVersion: 1,
      payload: { purchaseId },
    };
    const confirmed = await confirmPurchase(owner, confirmation);
    expect(confirmed.ok).toBe(true);
    // Unknown outcome recovery: the identical intent must not duplicate payable.
    expect(await confirmPurchase(owner, confirmation)).toEqual(confirmed);

    expect(
      (
        await recordPurchaseReceipt(owner, {
          ...envelope("receipt"),
          payload: {
            receiptId,
            purchaseId,
            lines: [
              {
                receiptLineId: crypto.randomUUID() as PurchaseReceiptLineId,
                purchaseLineId,
                productId: ctx.productIds[0],
                qualityGradeId: ctx.qualityGradeId,
                qualityGradeName: "Loại 1",
                quantity: { valueScaled: 100_000, unit: "kg" },
              },
            ],
            note: null,
          },
        })
      ).ok,
    ).toBe(true);

    expect(
      (
        await createSaleDraft(owner, {
          ...envelope("sale-draft"),
          payload: {
            saleId,
            customerId: ctx.customerId,
            currency: "VND",
            lines: [
              {
                lineId: saleLineId,
                productId: ctx.productIds[0],
                productName: "Cà chua",
                qualityGradeId: ctx.qualityGradeId,
                qualityGradeName: "Loại 1",
                quantity: { valueScaled: 100_000, unit: "kg" },
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
        await postSale(owner, {
          ...envelope("sale-post"),
          expectedVersion: 1,
          payload: { saleId },
        })
      ).ok,
    ).toBe(true);

    expect(
      (
        await createDeliveryDraft(owner, {
          ...envelope("delivery-draft"),
          payload: {
            deliveryId,
            saleId,
            lines: [
              {
                deliveryLineId,
                saleLineId,
                productId: ctx.productIds[0],
                qualityGradeId: ctx.qualityGradeId,
                quantity: { valueScaled: 60_000, unit: "kg" },
              },
            ],
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await dispatchDelivery(owner, {
          ...envelope("delivery-dispatch"),
          expectedVersion: 1,
          payload: { deliveryId },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordDeliveryReturn(owner, {
          ...envelope("delivery-return"),
          payload: {
            returnId: crypto.randomUUID() as DeliveryReturnId,
            deliveryId,
            lines: [
              {
                deliveryLineId,
                quantity: { valueScaled: 10_000, unit: "kg" },
              },
            ],
            reason: "Khách trả 10 kg dập",
          },
        })
      ).ok,
    ).toBe(true);

    expect(
      (
        await recordCustomerPayment(owner, {
          ...envelope("customer-payment"),
          payload: {
            paymentId: crypto.randomUUID(),
            customerId: ctx.customerId,
            amount: { amountMinor: 500_000, currency: "VND" },
            method: "cash",
            payerName: null,
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordSupplierPayment(owner, {
          ...envelope("supplier-payment"),
          payload: {
            supplierPaymentId: crypto.randomUUID() as SupplierPaymentId,
            supplierId,
            amount: { amountMinor: 400_000, currency: "VND" },
            method: "cash",
            note: null,
          },
        })
      ).ok,
    ).toBe(true);

    // Critical mistakes must fail before either ledger moves.
    const invalidSaleVoid = await voidSale(owner, {
      ...envelope("invalid-partial-return-void"),
      payload: {
        saleVoidId: crypto.randomUUID(),
        saleId,
        reasonCode: "goods_returned",
        reason: "Khách mới trả một phần",
      },
    });
    expect(invalidSaleVoid).toMatchObject({
      ok: false,
      error: { code: "SALE_GOODS_RETURN_INCOMPLETE" },
    });

    const invalidPurchaseVoid = await voidPurchase(owner, {
      ...envelope("invalid-purchase-void"),
      payload: {
        purchaseVoidId: crypto.randomUUID(),
        purchaseId,
        reasonCode: "other",
        reason: "Không được đảo thương mại khi hàng vẫn đã nhận",
      },
    });
    expect(invalidPurchaseVoid).toMatchObject({
      ok: false,
      error: { code: "PURCHASE_HAS_ACTIVE_RECEIPTS" },
    });

    const customerBalance = await getCustomerAccountBalance(owner, ctx.workspaceId, ctx.customerId);
    expect(customerBalance.ok && customerBalance.value.balance.amountMinor).toBe(1_500_000);
    const supplierBalance = await getSupplierBalance(owner, {
      workspaceId: ctx.workspaceId,
      supplierId,
    });
    expect(supplierBalance.ok && supplierBalance.value?.balance.amountMinor).toBe(600_000);

    const fulfilment = await getSaleFulfilment(owner, { workspaceId: ctx.workspaceId, saleId });
    expect(fulfilment.ok && fulfilment.value.lines[0]).toMatchObject({
      netFulfilled: { valueScaled: 50_000, unit: "kg" },
      remaining: { valueScaled: 50_000, unit: "kg" },
    });
    const receiving = await getPurchaseReceivingSummary(owner, {
      workspaceId: ctx.workspaceId,
      purchaseId,
    });
    expect(receiving.ok && receiving.value.capabilities.voidPurchase).toMatchObject({
      allowed: false,
      reasonCode: "PURCHASE_HAS_ACTIVE_RECEIPTS",
    });

    const inventory = await getInventoryReconciliation(owner, {
      workspaceId: ctx.workspaceId,
      productId: ctx.productIds[0],
      qualityGradeId: ctx.qualityGradeId,
      unit: "kg",
    });
    expect(inventory.ok && inventory.value).toMatchObject({
      status: "consistent",
      canonical: { quantityScaled: 50_000 },
      projected: { quantityScaled: 50_000 },
    });
    const customerReconciliation = await getAccountReconciliation(owner, {
      workspaceId: ctx.workspaceId,
      customerId: ctx.customerId,
    });
    expect(customerReconciliation.ok && customerReconciliation.value.kind).toBe("consistent");
    const supplierReconciliation = await getSupplierReconciliation(owner, {
      workspaceId: ctx.workspaceId,
      supplierId,
    });
    expect(supplierReconciliation.ok && supplierReconciliation.value.status).toBe("consistent");

    const inventoryReport = await getOperationalReport(owner, {
      workspaceId: ctx.workspaceId,
      reportType: "inventory_by_product_unit",
      businessDate: null,
      productId: ctx.productIds[0],
      unit: "kg",
      cursor: null,
      limit: 20,
    });
    expect(inventoryReport.ok && inventoryReport.value.totals.quantities).toEqual([
      { unit: "kg", valueScaled: 50_000 },
    ]);
    const outstanding = await getOperationalReport(owner, {
      workspaceId: ctx.workspaceId,
      reportType: "outstanding_delivery",
      businessDate: null,
      productId: ctx.productIds[0],
      unit: "kg",
      cursor: null,
      limit: 20,
    });
    expect(outstanding.ok && outstanding.value.totals.quantities).toEqual([
      { unit: "kg", valueScaled: 50_000 },
    ]);
  });
});
