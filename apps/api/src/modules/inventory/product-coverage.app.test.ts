import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  CUSTOMER_ID,
  LATER_TRANSACTION_TIME,
  OTHER_WORKSPACE_ID,
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  SUPPLIER_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
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
} from "@vuarau/domain-contracts";
import type { PurchaseReceiptState } from "@vuarau/domain-kernel";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { createPurchaseDraft, confirmPurchase } from "../purchase/purchase.handlers.ts";
import { createSaleDraft } from "../sale/create-sale-draft.handler.ts";
import { postSale } from "../sale/post-sale.handler.ts";
import {
  createDeliveryDraft,
  dispatchDelivery,
  recordDeliveryReturn,
} from "../delivery/delivery.handlers.ts";
import { recordPurchaseReceipt } from "./inventory.handlers.ts";
import { getProductCoverage } from "./inventory.queries.ts";

let harness: Harness;

const ids = {
  purchase: "00000000-0000-4000-8000-00000000c001" as PurchaseId,
  purchaseLine: "00000000-0000-4000-8000-00000000c002" as PurchaseLineId,
  receipt: "00000000-0000-4000-8000-00000000c003" as PurchaseReceiptId,
  receiptLine: "00000000-0000-4000-8000-00000000c004" as PurchaseReceiptLineId,
  sale: "00000000-0000-4000-8000-00000000c005" as SaleId,
  saleLine: "00000000-0000-4000-8000-00000000c006" as SaleLineId,
  delivery: "00000000-0000-4000-8000-00000000c007" as DeliveryId,
  deliveryLine: "00000000-0000-4000-8000-00000000c008" as DeliveryLineId,
  deliveryReturn: "00000000-0000-4000-8000-00000000c009" as DeliveryReturnId,
};

const envelope = (suffix: string) => ({
  commandId: `00000000-0000-4000-8000-00000000${suffix}`,
  idempotencyKey: `coverage-${suffix}`,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: LATER_TRANSACTION_TIME,
});

beforeEach(() => {
  harness = createHarness();
});

describe("UC-INVENTORY-001 — Product coverage", () => {
  it("ignores draft commercial records until they create canonical effects", async () => {
    expect(
      await createPurchaseDraft(harness.ctx, {
        ...envelope("d101"),
        payload: {
          purchaseId: ids.purchase,
          supplierId: SUPPLIER_ID,
          currency: "VND",
          lines: [
            {
              lineId: ids.purchaseLine,
              productId: PRODUCT_CA_CHUA_ID,
              productName: "Cà chua",
              quantity: { valueScaled: 10_000, unit: "kg" },
              unitPrice: { amountMinor: 10_000, currency: "VND" },
            },
          ],
          note: null,
          evidenceReferences: [],
          dueAt: null,
          replacesPurchaseId: null,
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await createSaleDraft(harness.ctx, {
        ...envelope("d102"),
        payload: {
          saleId: ids.sale,
          customerId: CUSTOMER_ID,
          currency: "VND",
          lines: [
            {
              lineId: ids.saleLine,
              productId: PRODUCT_CA_CHUA_ID,
              productName: "Cà chua",
              qualityGradeId: QUALITY_GRADE_1_ID,
              qualityGradeName: "Loại 1",
              quantity: { valueScaled: 12_000, unit: "kg" },
              unitPrice: { amountMinor: 12_000, currency: "VND" },
            },
          ],
          note: null,
          dueAt: null,
          replacesSaleId: null,
        },
      }),
    ).toMatchObject({ ok: true });

    const result = await getProductCoverage(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      productIds: [PRODUCT_CA_CHUA_ID],
    });
    expect(result.ok && result.value[0]?.quantities).toEqual([
      {
        unit: "kg",
        qualityGradeId: null,
        qualityGradeName: null,
        onHand: { valueScaled: 0, unit: "kg" },
        inboundRemaining: { valueScaled: 0, unit: "kg" },
        outboundRemaining: { valueScaled: 0, unit: "kg" },
        availableAfterCommitments: { valueScaled: 0, unit: "kg" },
        classification: "idle",
      },
    ]);
  });

  it("derives shortage from on-hand, confirmed inbound and posted outbound without double counting", async () => {
    expect(
      await createPurchaseDraft(harness.ctx, {
        ...envelope("c101"),
        payload: {
          purchaseId: ids.purchase,
          supplierId: SUPPLIER_ID,
          currency: "VND",
          lines: [
            {
              lineId: ids.purchaseLine,
              productId: PRODUCT_CA_CHUA_ID,
              productName: "Cà chua",
              quantity: { valueScaled: 10_000, unit: "kg" },
              unitPrice: { amountMinor: 10_000, currency: "VND" },
            },
          ],
          note: null,
          evidenceReferences: [],
          dueAt: null,
          replacesPurchaseId: null,
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await confirmPurchase(harness.ctx, {
        ...envelope("c102"),
        expectedVersion: 1,
        payload: { purchaseId: ids.purchase },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await recordPurchaseReceipt(harness.ctx, {
        ...envelope("c103"),
        payload: {
          receiptId: ids.receipt,
          purchaseId: ids.purchase,
          lines: [
            {
              receiptLineId: ids.receiptLine,
              purchaseLineId: ids.purchaseLine,
              productId: PRODUCT_CA_CHUA_ID,
              qualityGradeId: QUALITY_GRADE_1_ID,
              qualityGradeName: "Loại 1",
              quantity: { valueScaled: 4_000, unit: "kg" },
            },
          ],
          note: null,
          evidenceReferences: [],
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await createSaleDraft(harness.ctx, {
        ...envelope("c104"),
        payload: {
          saleId: ids.sale,
          customerId: CUSTOMER_ID,
          currency: "VND",
          lines: [
            {
              lineId: ids.saleLine,
              productId: PRODUCT_CA_CHUA_ID,
              productName: "Cà chua",
              qualityGradeId: QUALITY_GRADE_1_ID,
              qualityGradeName: "Loại 1",
              quantity: { valueScaled: 12_000, unit: "kg" },
              unitPrice: { amountMinor: 12_000, currency: "VND" },
            },
          ],
          note: null,
          dueAt: null,
          replacesSaleId: null,
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await postSale(harness.ctx, {
        ...envelope("c105"),
        expectedVersion: 1,
        payload: { saleId: ids.sale },
      }),
    ).toMatchObject({ ok: true });

    const beforeDispatch = await getProductCoverage(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      productIds: [PRODUCT_CA_CHUA_ID],
    });
    expect(beforeDispatch.ok && beforeDispatch.value[0]?.quantities).toEqual([
      {
        unit: "kg",
        qualityGradeId: null,
        qualityGradeName: null,
        onHand: { valueScaled: 0, unit: "kg" },
        inboundRemaining: { valueScaled: 6_000, unit: "kg" },
        outboundRemaining: { valueScaled: 0, unit: "kg" },
        availableAfterCommitments: { valueScaled: 6_000, unit: "kg" },
        classification: "covered",
      },
      {
        unit: "kg",
        qualityGradeId: QUALITY_GRADE_1_ID,
        qualityGradeName: "Loại 1",
        onHand: { valueScaled: 4_000, unit: "kg" },
        inboundRemaining: { valueScaled: 0, unit: "kg" },
        outboundRemaining: { valueScaled: 12_000, unit: "kg" },
        availableAfterCommitments: { valueScaled: -8_000, unit: "kg" },
        classification: "shortage",
      },
    ]);

    expect(
      await createDeliveryDraft(harness.ctx, {
        ...envelope("c106"),
        payload: {
          deliveryId: ids.delivery,
          saleId: ids.sale,
          lines: [
            {
              deliveryLineId: ids.deliveryLine,
              saleLineId: ids.saleLine,
              productId: PRODUCT_CA_CHUA_ID,
              qualityGradeId: QUALITY_GRADE_1_ID,
              quantity: { valueScaled: 5_000, unit: "kg" },
            },
          ],
          note: null,
          evidenceReferences: [],
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await dispatchDelivery(harness.ctx, {
        ...envelope("c107"),
        expectedVersion: 1,
        payload: { deliveryId: ids.delivery },
      }),
    ).toMatchObject({ ok: true });

    const afterDispatch = await getProductCoverage(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      productIds: [PRODUCT_CA_CHUA_ID],
    });
    expect(
      afterDispatch.ok &&
        afterDispatch.value[0]?.quantities.find(
          (quantity) => quantity.qualityGradeId === QUALITY_GRADE_1_ID,
        ),
    ).toMatchObject({
      qualityGradeId: QUALITY_GRADE_1_ID,
      qualityGradeName: "Loại 1",
      onHand: { valueScaled: -1_000, unit: "kg" },
      outboundRemaining: { valueScaled: 7_000, unit: "kg" },
      availableAfterCommitments: { valueScaled: -8_000, unit: "kg" },
    });

    expect(
      await recordDeliveryReturn(harness.ctx, {
        ...envelope("c108"),
        payload: {
          returnId: ids.deliveryReturn,
          deliveryId: ids.delivery,
          lines: [
            {
              deliveryLineId: ids.deliveryLine,
              quantity: { valueScaled: 2_000, unit: "kg" },
            },
          ],
          reason: "Khách trả lại một phần",
          evidenceReferences: [],
        },
      }),
    ).toMatchObject({ ok: true });
    const afterReturn = await getProductCoverage(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      productIds: [PRODUCT_CA_CHUA_ID],
    });
    expect(
      afterReturn.ok &&
        afterReturn.value[0]?.quantities.find(
          (quantity) => quantity.qualityGradeId === QUALITY_GRADE_1_ID,
        ),
    ).toMatchObject({
      qualityGradeId: QUALITY_GRADE_1_ID,
      qualityGradeName: "Loại 1",
      onHand: { valueScaled: 1_000, unit: "kg" },
      outboundRemaining: { valueScaled: 9_000, unit: "kg" },
      availableAfterCommitments: { valueScaled: -8_000, unit: "kg" },
    });
  });

  it("fails closed across workspaces", async () => {
    const result = await getProductCoverage(harness.ctx, {
      workspaceId: OTHER_WORKSPACE_ID,
      productIds: [PRODUCT_CA_CHUA_ID],
    });
    expect(result.ok).toBe(false);
  });

  it("fails closed when available coverage exceeds the exact numeric range", async () => {
    const purchaseId = crypto.randomUUID() as PurchaseId;
    const purchaseLineId = crypto.randomUUID() as PurchaseLineId;
    expect(
      await createPurchaseDraft(harness.ctx, {
        ...envelope("ca10"),
        payload: {
          purchaseId,
          supplierId: SUPPLIER_ID,
          currency: "VND",
          lines: [
            {
              lineId: purchaseLineId,
              productId: PRODUCT_CA_CHUA_ID,
              productName: "Cà chua",
              quantity: { valueScaled: Number.MAX_SAFE_INTEGER, unit: "kg" },
              unitPrice: { amountMinor: 1, currency: "VND" },
            },
          ],
          note: null,
          evidenceReferences: [],
          dueAt: null,
          replacesPurchaseId: null,
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await confirmPurchase(harness.ctx, {
        ...envelope("ca11"),
        expectedVersion: 1,
        payload: { purchaseId },
      }),
    ).toMatchObject({ ok: true });
    await harness.deps.uow.transaction((repos) =>
      repos.inventoryBalances.save({
        workspaceId: WORKSPACE_ID,
        productId: PRODUCT_CA_CHUA_ID,
        qualityGradeId: null,
        unit: "kg",
        quantityScaled: Number.MAX_SAFE_INTEGER,
        movementCount: 1,
        lastMovementTransactionTime: LATER_TRANSACTION_TIME,
        updatedAt: LATER_TRANSACTION_TIME,
      }),
    );

    const result = await getProductCoverage(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      productIds: [PRODUCT_CA_CHUA_ID],
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "PERSISTED_NUMBER_OUT_OF_RANGE",
        details: { field: "product_coverage.available_after_commitments" },
      },
    });
  });

  it("fails closed when persisted receipts mix units for one purchase line", async () => {
    const purchaseId = "00000000-0000-4000-8000-00000000ca01" as PurchaseId;
    const purchaseLineId = "00000000-0000-4000-8000-00000000ca02" as PurchaseLineId;
    const receiptId = "00000000-0000-4000-8000-00000000ca03" as PurchaseReceiptId;

    expect(
      await createPurchaseDraft(harness.ctx, {
        ...envelope("ca01"),
        payload: {
          purchaseId,
          supplierId: SUPPLIER_ID,
          currency: "VND",
          lines: [
            {
              lineId: purchaseLineId,
              productId: PRODUCT_CA_CHUA_ID,
              productName: "Cà chua",
              quantity: { valueScaled: 10_000, unit: "kg" },
              unitPrice: { amountMinor: 10_000, currency: "VND" },
            },
          ],
          note: null,
          evidenceReferences: [],
          dueAt: null,
          replacesPurchaseId: null,
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await confirmPurchase(harness.ctx, {
        ...envelope("ca02"),
        expectedVersion: 1,
        payload: { purchaseId },
      }),
    ).toMatchObject({ ok: true });

    await harness.deps.uow.transaction((repos) =>
      repos.purchaseReceipts.insert({
        id: receiptId,
        workspaceId: WORKSPACE_ID,
        purchaseId,
        lines: [
          {
            receiptLineId: "00000000-0000-4000-8000-00000000ca04" as PurchaseReceiptLineId,
            purchaseLineId,
            productId: PRODUCT_CA_CHUA_ID,
            qualityGradeId: null,
            qualityGradeName: null,
            quantity: { valueScaled: 1_000, unit: "kg" },
          },
          {
            receiptLineId: "00000000-0000-4000-8000-00000000ca05" as PurchaseReceiptLineId,
            purchaseLineId,
            productId: PRODUCT_CA_CHUA_ID,
            qualityGradeId: null,
            qualityGradeName: null,
            quantity: { valueScaled: 1, unit: "bo" },
          },
        ],
        note: null,
        evidenceReferences: [],
        transactionTime: LATER_TRANSACTION_TIME,
        recordedAt: LATER_TRANSACTION_TIME,
        actorId: ACTOR_ID,
        reversal: null,
      } satisfies PurchaseReceiptState),
    );

    expect(
      await getProductCoverage(harness.ctx, {
        workspaceId: WORKSPACE_ID,
        productIds: [PRODUCT_CA_CHUA_ID],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVENTORY_RECONCILIATION_INTEGRITY_FAILURE", retryable: false },
    });
  });
});
