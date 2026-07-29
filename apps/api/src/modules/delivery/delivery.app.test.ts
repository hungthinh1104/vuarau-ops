import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  CUSTOMER_ID,
  LATER_TRANSACTION_TIME,
  PRODUCT_CA_CHUA_ID,
  SALES_ACTOR_ID,
  WORKSPACE_ID,
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
  it("dispatches once, completes without another movement, returns explicitly, and never changes debt", async () => {
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
            quantity: { valueScaled: 60_000, unit: "kg" },
          },
        ],
        note: "Chuyến sáng",
      },
    });
    expect(create.ok).toBe(true);
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
      },
    };
    const returned = await recordDeliveryReturn(harness.ctx, returnInput);
    expect(await recordDeliveryReturn(harness.ctx, returnInput)).toEqual(returned);
    expect(harness.db.inventoryMovementRecords().map((row) => row.quantity.valueScaled)).toEqual([
      -60_000, 10_000,
    ]);
    expect(harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID)).toHaveLength(debtBefore);
    const fulfilment = await getSaleFulfilment(harness.ctx, { workspaceId: WORKSPACE_ID, saleId });
    expect(fulfilment.ok && fulfilment.value.lines[0]).toMatchObject({
      dispatched: { valueScaled: 60_000, unit: "kg" },
      returned: { valueScaled: 10_000, unit: "kg" },
      remaining: { valueScaled: 50_000, unit: "kg" },
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
