import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  CUSTOMER_ID,
  LATER_TRANSACTION_TIME,
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  SALES_ACTOR_ID,
  WORKSPACE_ID,
  postedSale,
} from "@vuarau/test-fixtures";
import type {
  DeliveryId,
  DeliveryLineId,
  DeliveryReturnId,
  SaleId,
  SaleLineId,
} from "@vuarau/domain-contracts";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { createSaleDraft } from "../sale/create-sale-draft.handler.ts";
import { postSale } from "../sale/post-sale.handler.ts";
import {
  createDeliveryDraft,
  dispatchDelivery,
  markDeliveryDelivered,
  recordDeliveryReturn,
} from "./delivery.handlers.ts";
import { getSaleFulfilment } from "./delivery.queries.ts";
import { getOperationalReport } from "../report/report.queries.ts";

let harness: Harness;
const saleId = "00000000-0000-4000-8000-000000000d01" as SaleId;
const saleLineId = "00000000-0000-4000-8000-000000000d02" as SaleLineId;
const deliveryId = "00000000-0000-4000-8000-000000000d03" as DeliveryId;
const deliveryLineId = "00000000-0000-4000-8000-000000000d04" as DeliveryLineId;
const base = (suffix: string) => ({
  commandId: `00000000-0000-4000-8000-000000000${suffix}`,
  idempotencyKey: `delivery-${suffix}`,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: LATER_TRANSACTION_TIME,
});

beforeEach(async () => {
  harness = createHarness();
  const draft = await createSaleDraft(harness.ctx, {
    ...base("d10"),
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
          unitPrice: { amountMinor: 10_000, currency: "VND" },
        },
      ],
      note: null,
      dueAt: null,
      replacesSaleId: null,
    },
  });
  expect(draft.ok).toBe(true);
  const posted = await postSale(harness.ctx, {
    ...base("d11"),
    expectedVersion: 1,
    payload: { saleId },
  });
  expect(posted.ok).toBe(true);
});

describe("M19 Delivery application flow (TC-DELIVERY-002)", () => {
  it("TC-EVIDENCE-004 — keeps delivery and return evidence beside physical facts without changing debt", async () => {
    const debtBefore = harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID).length;
    const create = await createDeliveryDraft(harness.ctx, {
      ...base("d12"),
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
        note: "Chuyến sáng",
        evidenceReferences: ["dispatch-sheet://delivery/001", "photo://loading/001"],
      },
    });
    expect(create.ok).toBe(true);
    if (create.ok)
      expect(create.value.evidenceReferences).toEqual([
        "dispatch-sheet://delivery/001",
        "photo://loading/001",
      ]);
    const dispatchInput = {
      ...base("d13"),
      expectedVersion: 1,
      payload: { deliveryId },
    };
    const dispatched = await dispatchDelivery(harness.ctx, dispatchInput);
    const replay = await dispatchDelivery(harness.ctx, dispatchInput);
    expect(replay).toEqual(dispatched);
    expect(harness.db.inventoryMovementRecords()).toHaveLength(1);
    const completed = await markDeliveryDelivered(harness.ctx, {
      ...base("d14"),
      expectedVersion: 2,
      payload: { deliveryId },
    });
    expect(completed.ok).toBe(true);
    expect(harness.db.inventoryMovementRecords()).toHaveLength(1);
    const returnInput = {
      ...base("d15"),
      payload: {
        returnId: "00000000-0000-4000-8000-000000000d15" as DeliveryReturnId,
        deliveryId,
        lines: [
          {
            deliveryLineId,
            quantity: { valueScaled: 10_000, unit: "kg" },
          },
        ],
        reason: "Khách trả lại",
        evidenceReferences: ["photo://return/001"],
      },
    };
    const returned = await recordDeliveryReturn(harness.ctx, returnInput);
    expect(await recordDeliveryReturn(harness.ctx, returnInput)).toEqual(returned);
    expect(returned.ok && returned.value.returns[0]?.evidenceReferences).toEqual([
      "photo://return/001",
    ]);
    expect(harness.db.inventoryMovementRecords().map((row) => row.quantity.valueScaled)).toEqual([
      -60_000, 10_000,
    ]);
    expect(harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID)).toHaveLength(debtBefore);
    const fulfilment = await getSaleFulfilment(harness.ctx, { workspaceId: WORKSPACE_ID, saleId });
    expect(fulfilment.ok && fulfilment.value.lines[0]).toMatchObject({
      dispatched: { valueScaled: 60_000, unit: "kg" },
      returned: { valueScaled: 10_000, unit: "kg" },
      netFulfilled: { valueScaled: 50_000, unit: "kg" },
      remaining: { valueScaled: 50_000, unit: "kg" },
      fulfilmentState: "returned_partial",
      blockedReason: null,
    });
    const inventoryReport = await getOperationalReport(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      reportType: "inventory_movement_report",
      businessDate: null,
      productId: PRODUCT_CA_CHUA_ID,
      unit: "kg",
      cursor: null,
      limit: 20,
    });
    expect(inventoryReport.ok && inventoryReport.value.totals.quantities).toEqual([
      { unit: "kg", valueScaled: -50_000 },
    ]);
    const outstanding = await getOperationalReport(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      reportType: "outstanding_delivery",
      businessDate: null,
      productId: null,
      unit: null,
      cursor: null,
      limit: 20,
    });
    expect(outstanding.ok && outstanding.value.page.items[0]?.quantity).toEqual({
      valueScaled: 50_000,
      unit: "kg",
    });
  });

  it("surfaces immutable legacy posted lines as attention instead of inventing identity", async () => {
    const legacySaleId = crypto.randomUUID() as SaleId;
    harness.db.seedSale({
      ...postedSale,
      id: legacySaleId,
      workspaceId: WORKSPACE_ID,
      lines: postedSale.lines.map((line) => ({
        ...line,
        productId: null,
        qualityGradeId: null,
        qualityGradeName: null,
      })),
    });
    const result = await getSaleFulfilment(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      saleId: legacySaleId,
    });
    expect(result.ok && result.value).toMatchObject({
      integrity: "attention",
      lines: expect.arrayContaining([
        expect.objectContaining({
          fulfilmentState: "attention",
          blockedReason: "legacy_product_unresolved",
        }),
      ]),
    });
  });

  it("BR-DELIVERY-006 — read capability and create command both block replacement fulfilment after predecessor dispatch", async () => {
    const created = await createDeliveryDraft(harness.ctx, {
      ...base("d18"),
      payload: {
        deliveryId,
        saleId,
        lines: [
          {
            deliveryLineId,
            saleLineId,
            productId: PRODUCT_CA_CHUA_ID,
            qualityGradeId: QUALITY_GRADE_1_ID,
            quantity: { valueScaled: 10_000, unit: "kg" },
          },
        ],
        note: null,
      },
    });
    expect(created.ok).toBe(true);
    const dispatched = await dispatchDelivery(harness.ctx, {
      ...base("d19"),
      expectedVersion: 1,
      payload: { deliveryId },
    });
    expect(dispatched.ok).toBe(true);

    const replacementId = "00000000-0000-4000-8000-000000000d20" as SaleId;
    harness.db.seedSale({
      ...postedSale,
      id: replacementId,
      workspaceId: WORKSPACE_ID,
      replacesSaleId: saleId,
    });

    const read = await getSaleFulfilment(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      saleId: replacementId,
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.capabilities.createDelivery).toMatchObject({
      allowed: false,
      reasonCode: "DELIVERY_REPLACEMENT_FULFILMENT_BLOCKED",
    });

    const replacementLine = postedSale.lines[0]!;
    const command = await createDeliveryDraft(harness.ctx, {
      ...base("d21"),
      payload: {
        deliveryId: "00000000-0000-4000-8000-000000000d21" as DeliveryId,
        saleId: replacementId,
        lines: [
          {
            deliveryLineId: "00000000-0000-4000-8000-000000000d22" as DeliveryLineId,
            saleLineId: replacementLine.lineId,
            productId: replacementLine.productId!,
            qualityGradeId: replacementLine.qualityGradeId!,
            quantity: replacementLine.quantity,
          },
        ],
        note: null,
      },
    });
    expect(command.ok).toBe(false);
    if (!command.ok) {
      expect(command.error.code).toBe("DELIVERY_REPLACEMENT_FULFILMENT_BLOCKED");
    }
  });

  it("BR-DELIVERY-006 — blocks delivery across a multi-hop replacement chain when an older ancestor was fulfilled", async () => {
    const created = await createDeliveryDraft(harness.ctx, {
      ...base("d23"),
      payload: {
        deliveryId,
        saleId,
        lines: [
          {
            deliveryLineId,
            saleLineId,
            productId: PRODUCT_CA_CHUA_ID,
            qualityGradeId: QUALITY_GRADE_1_ID,
            quantity: { valueScaled: 10_000, unit: "kg" },
          },
        ],
        note: null,
      },
    });
    expect(created.ok).toBe(true);
    const dispatched = await dispatchDelivery(harness.ctx, {
      ...base("d24"),
      expectedVersion: 1,
      payload: { deliveryId },
    });
    expect(dispatched.ok).toBe(true);

    const firstReplacementId = "00000000-0000-4000-8000-000000000d25" as SaleId;
    const secondReplacementId = "00000000-0000-4000-8000-000000000d26" as SaleId;
    harness.db.seedSale({
      ...postedSale,
      id: firstReplacementId,
      workspaceId: WORKSPACE_ID,
      replacesSaleId: saleId,
    });
    harness.db.seedSale({
      ...postedSale,
      id: secondReplacementId,
      workspaceId: WORKSPACE_ID,
      replacesSaleId: firstReplacementId,
    });

    const read = await getSaleFulfilment(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      saleId: secondReplacementId,
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.capabilities.createDelivery).toMatchObject({
      allowed: false,
      reasonCode: "DELIVERY_REPLACEMENT_FULFILMENT_BLOCKED",
    });

    const replacementLine = postedSale.lines[0]!;
    const command = await createDeliveryDraft(harness.ctx, {
      ...base("d27"),
      payload: {
        deliveryId: "00000000-0000-4000-8000-000000000d27" as DeliveryId,
        saleId: secondReplacementId,
        lines: [
          {
            deliveryLineId: "00000000-0000-4000-8000-000000000d28" as DeliveryLineId,
            saleLineId: replacementLine.lineId,
            productId: replacementLine.productId!,
            qualityGradeId: replacementLine.qualityGradeId!,
            quantity: replacementLine.quantity,
          },
        ],
        note: null,
      },
    });
    expect(command.ok).toBe(false);
    if (!command.ok) {
      expect(command.error.code).toBe("DELIVERY_REPLACEMENT_FULFILMENT_BLOCKED");
    }
  });

  it("lets sales prepare a draft but refuses warehouse-only dispatch authority to sales", async () => {
    const created = await createDeliveryDraft(harness.contextFor(SALES_ACTOR_ID), {
      ...base("d16"),
      actorId: SALES_ACTOR_ID,
      payload: {
        deliveryId,
        saleId,
        lines: [
          {
            deliveryLineId,
            saleLineId,
            productId: PRODUCT_CA_CHUA_ID,
            qualityGradeId: QUALITY_GRADE_1_ID,
            quantity: { valueScaled: 10_000, unit: "kg" },
          },
        ],
        note: null,
      },
    });
    expect(created.ok).toBe(true);
    const denied = await dispatchDelivery(harness.contextFor(SALES_ACTOR_ID), {
      ...base("d17"),
      actorId: SALES_ACTOR_ID,
      expectedVersion: 1,
      payload: { deliveryId },
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe("PERMISSION_DENIED");
  });
});
