import { beforeEach, describe, expect, it } from "vitest";
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
  ACTOR_ID,
  CUSTOMER_ID,
  LATER_TRANSACTION_TIME,
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../testing/command-test-harness.ts";
import { createSupplier, recordSupplierPayment } from "../modules/supplier/supplier.handlers.ts";
import {
  getSupplierBalance,
  getSupplierReconciliation,
} from "../modules/supplier/supplier.queries.ts";
import {
  confirmPurchase,
  createPurchaseDraft,
  voidPurchase,
} from "../modules/purchase/purchase.handlers.ts";
import { recordPurchaseReceipt } from "../modules/inventory/inventory.handlers.ts";
import {
  getInventoryReconciliation,
  getPurchaseReceivingSummary,
} from "../modules/inventory/inventory.queries.ts";
import { createSaleDraft } from "../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../modules/sale/post-sale.handler.ts";
import { voidSale } from "../modules/sale/void-sale.handler.ts";
import {
  createDeliveryDraft,
  dispatchDelivery,
  recordDeliveryReturn,
} from "../modules/delivery/delivery.handlers.ts";
import { getSaleFulfilment } from "../modules/delivery/delivery.queries.ts";
import { recordCustomerPayment } from "../modules/payment/record-payment.handler.ts";
import {
  getAccountReconciliation,
  getCustomerAccountBalance,
} from "../modules/account/account.queries.ts";
import { getOperationalReport } from "../modules/report/report.queries.ts";

let harness: Harness;
let sequence = 0;

const envelope = (label: string) => {
  sequence += 1;
  return {
    commandId: crypto.randomUUID(),
    idempotencyKey: `full-depot-day-${sequence}-${label}`,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: LATER_TRANSACTION_TIME,
  };
};

beforeEach(() => {
  harness = createHarness();
  sequence = 0;
});

describe("TC-OPS-015 full depot day application rehearsal", () => {
  it("keeps customer money, supplier money, inventory and fulfilment independently reconcilable", async () => {
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
        await createSupplier(harness.ctx, {
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
        await createPurchaseDraft(harness.ctx, {
          ...envelope("purchase-draft"),
          payload: {
            purchaseId,
            supplierId,
            currency: "VND",
            lines: [
              {
                lineId: purchaseLineId,
                productId: PRODUCT_CA_CHUA_ID,
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
    const confirmed = await confirmPurchase(harness.ctx, confirmation);
    expect(confirmed.ok).toBe(true);
    // Unknown outcome recovery: the identical intent must not duplicate payable.
    expect(await confirmPurchase(harness.ctx, confirmation)).toEqual(confirmed);

    expect(
      (
        await recordPurchaseReceipt(harness.ctx, {
          ...envelope("receipt"),
          payload: {
            receiptId,
            purchaseId,
            lines: [
              {
                receiptLineId: crypto.randomUUID() as PurchaseReceiptLineId,
                purchaseLineId,
                productId: PRODUCT_CA_CHUA_ID,
                qualityGradeId: QUALITY_GRADE_1_ID,
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
        await createSaleDraft(harness.ctx, {
          ...envelope("sale-draft"),
          payload: {
            saleId,
            customerId: CUSTOMER_ID,
            currency: "VND",
            lines: [
              {
                lineId: saleLineId,
                productId: PRODUCT_CA_CHUA_ID,
                productName: "Cà chua",
                qualityGradeId: QUALITY_GRADE_1_ID,
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
        await postSale(harness.ctx, {
          ...envelope("sale-post"),
          expectedVersion: 1,
          payload: { saleId },
        })
      ).ok,
    ).toBe(true);

    expect(
      (
        await createDeliveryDraft(harness.ctx, {
          ...envelope("delivery-draft"),
          payload: {
            deliveryId,
            saleId,
            lines: [
              {
                deliveryLineId,
                saleLineId,
                productId: PRODUCT_CA_CHUA_ID,
                qualityGradeId: QUALITY_GRADE_1_ID,
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
        await dispatchDelivery(harness.ctx, {
          ...envelope("delivery-dispatch"),
          expectedVersion: 1,
          payload: { deliveryId },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordDeliveryReturn(harness.ctx, {
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
        await recordCustomerPayment(harness.ctx, {
          ...envelope("customer-payment"),
          payload: {
            paymentId: crypto.randomUUID(),
            customerId: CUSTOMER_ID,
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
        await recordSupplierPayment(harness.ctx, {
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
    const invalidSaleVoid = await voidSale(harness.ctx, {
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

    const invalidPurchaseVoid = await voidPurchase(harness.ctx, {
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

    const customerBalance = await getCustomerAccountBalance(harness.ctx, WORKSPACE_ID, CUSTOMER_ID);
    expect(customerBalance.ok && customerBalance.value.balance.amountMinor).toBe(1_500_000);
    const supplierBalance = await getSupplierBalance(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      supplierId,
    });
    expect(supplierBalance.ok && supplierBalance.value?.balance.amountMinor).toBe(600_000);

    const fulfilment = await getSaleFulfilment(harness.ctx, { workspaceId: WORKSPACE_ID, saleId });
    expect(fulfilment.ok && fulfilment.value.lines[0]).toMatchObject({
      netFulfilled: { valueScaled: 50_000, unit: "kg" },
      remaining: { valueScaled: 50_000, unit: "kg" },
    });
    const receiving = await getPurchaseReceivingSummary(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      purchaseId,
    });
    expect(receiving.ok && receiving.value.capabilities.voidPurchase).toMatchObject({
      allowed: false,
      reasonCode: "PURCHASE_HAS_ACTIVE_RECEIPTS",
    });

    const inventory = await getInventoryReconciliation(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      productId: PRODUCT_CA_CHUA_ID,
      qualityGradeId: QUALITY_GRADE_1_ID,
      unit: "kg",
    });
    expect(inventory.ok && inventory.value).toMatchObject({
      status: "consistent",
      canonical: { quantityScaled: 50_000 },
      projected: { quantityScaled: 50_000 },
    });
    const customerReconciliation = await getAccountReconciliation(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
    });
    expect(customerReconciliation.ok && customerReconciliation.value.kind).toBe("consistent");
    const supplierReconciliation = await getSupplierReconciliation(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      supplierId,
    });
    expect(supplierReconciliation.ok && supplierReconciliation.value.status).toBe("consistent");

    const inventoryReport = await getOperationalReport(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      reportType: "inventory_by_product_unit",
      businessDate: null,
      productId: PRODUCT_CA_CHUA_ID,
      unit: "kg",
      cursor: null,
      limit: 20,
    });
    expect(inventoryReport.ok && inventoryReport.value.totals.quantities).toEqual([
      { unit: "kg", valueScaled: 50_000 },
    ]);
    const outstanding = await getOperationalReport(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      reportType: "outstanding_delivery",
      businessDate: null,
      productId: PRODUCT_CA_CHUA_ID,
      unit: "kg",
      cursor: null,
      limit: 20,
    });
    expect(outstanding.ok && outstanding.value.totals.quantities).toEqual([
      { unit: "kg", valueScaled: 50_000 },
    ]);
  });
});
