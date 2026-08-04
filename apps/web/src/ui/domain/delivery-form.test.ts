import type { DeliveryLineId, SaleDetailDto, SaleFulfilmentDto } from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { PRODUCT_CA_CHUA_ID, WORKSPACE_ID, testUuid } from "@vuarau/test-fixtures/ids";
import { RECORDED_AT, TRANSACTION_TIME } from "@vuarau/test-fixtures/time";
import { buildDeliveryDraftLines, hasDeliverableLines } from "./delivery-form.ts";

const saleLineId = testUuid("d", 1) as SaleDetailDto["sale"]["lines"][number]["lineId"];
const saleId = testUuid("d", 2) as SaleDetailDto["sale"]["id"];

const detail = {
  sale: {
    id: saleId,
    workspaceId: WORKSPACE_ID,
    customerId: testUuid("d", 3),
    status: "posted",
    financialState: "receivable",
    dueState: "not_due",
    currency: "VND",
    lines: [
      {
        lineId: saleLineId,
        productId: PRODUCT_CA_CHUA_ID,
        productName: "Cà chua",
        qualityGradeId: null,
        qualityGradeName: null,
        quantity: { valueScaled: 10_000, unit: "kg" },
        unitPrice: { amountMinor: 10_000, currency: "VND" },
        lineTotal: { amountMinor: 100_000, currency: "VND" },
      },
    ],
    totalAmount: { amountMinor: 100_000, currency: "VND" },
    note: null,
    evidenceReferences: [],
    dueAt: null,
    version: 2,
    transactionTime: TRANSACTION_TIME,
    recordedAt: RECORDED_AT,
    postedAt: RECORDED_AT,
    discardedAt: null,
    replacesSaleId: null,
    voidRecord: null,
    capabilities: {
      post: { allowed: false, reasonCode: "SALE_ALREADY_POSTED" },
      void: { allowed: false, reasonCode: "SALE_ALREADY_POSTED" },
    },
  },
  balance: { amountMinor: 100_000, currency: "VND" },
  classification: "receivable",
  correction: { voidRecord: null, replacedBySaleId: null },
} as unknown as SaleDetailDto;

const fulfilment = {
  saleId,
  integrity: "healthy",
  capabilities: { createDelivery: { allowed: true } },
  lines: [
    {
      saleLineId,
      productId: PRODUCT_CA_CHUA_ID,
      productName: "Cà chua",
      qualityGradeId: null,
      qualityGradeName: null,
      ordered: { valueScaled: 10_000, unit: "kg" },
      dispatched: { valueScaled: 0, unit: "kg" },
      returned: { valueScaled: 0, unit: "kg" },
      netFulfilled: { valueScaled: 0, unit: "kg" },
      remaining: { valueScaled: 10_000, unit: "kg" },
      fulfilmentState: "unfulfilled",
      blockedReason: null,
    },
  ],
} as SaleFulfilmentDto;

describe("delivery form", () => {
  it("submits an ungraded Sale line when the workspace does not use grades", () => {
    const lines = buildDeliveryDraftLines(
      detail,
      fulfilment,
      {},
      () => testUuid("d", 4) as DeliveryLineId,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      productId: PRODUCT_CA_CHUA_ID,
      qualityGradeId: null,
      quantity: { valueScaled: 10_000, unit: "kg" },
    });
  });

  it("never treats an empty or invalid quantity as a submit-ready delivery", () => {
    expect(hasDeliverableLines(detail, fulfilment, { [saleLineId]: "0" })).toBe(false);
    expect(
      buildDeliveryDraftLines(
        detail,
        fulfilment,
        { [saleLineId]: "0" },
        () => testUuid("d", 5) as DeliveryLineId,
      ),
    ).toEqual([]);
  });
});
