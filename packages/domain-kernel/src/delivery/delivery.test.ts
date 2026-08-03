import { describe, expect, it } from "vitest";
import type {
  CreateDeliveryDraftCommand,
  DeliveryId,
  DeliveryLineId,
  ProductId,
  QualityGradeId,
  SaleId,
  SaleLineId,
} from "@vuarau/domain-contracts";
import type { SaleState } from "../shared/state.ts";
import {
  decideCreateDeliveryDraft,
  decideDispatchDelivery,
  decideRecordDeliveryReturn,
  decideUpdateDeliveryDraft,
} from "./index.ts";

const sale = {
  id: crypto.randomUUID() as SaleId,
  workspaceId: crypto.randomUUID(),
  customerId: crypto.randomUUID(),
  status: "posted",
  currency: "VND",
  lines: [
    {
      lineId: crypto.randomUUID() as SaleLineId,
      productId: crypto.randomUUID() as ProductId,
      productName: "Cải ngọt",
      qualityGradeId: crypto.randomUUID() as QualityGradeId,
      qualityGradeName: "Loại 1",
      quantity: { valueScaled: 100_000, unit: "kg" },
      unitPrice: { amountMinor: 20_000, currency: "VND" },
      lineTotal: { amountMinor: 2_000_000, currency: "VND" },
    },
  ],
  totalAmount: { amountMinor: 2_000_000, currency: "VND" },
  note: null,
  version: 2,
  transactionTime: "2026-07-28T01:00:00.000Z",
  recordedAt: "2026-07-28T01:00:01.000Z",
  postedAt: "2026-07-28T01:00:01.000Z",
  discardedAt: null,
  dueAt: null,
  replacesSaleId: null,
  voidRecord: null,
} as unknown as SaleState;

const command = (quantity: number): CreateDeliveryDraftCommand =>
  ({
    commandId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    workspaceId: sale.workspaceId,
    actorId: crypto.randomUUID(),
    occurredAt: "2026-07-28T02:00:00.000Z",
    payload: {
      deliveryId: crypto.randomUUID() as DeliveryId,
      saleId: sale.id,
      lines: [
        {
          deliveryLineId: crypto.randomUUID() as DeliveryLineId,
          saleLineId: sale.lines[0]!.lineId,
          productId: sale.lines[0]!.productId!,
          qualityGradeId: sale.lines[0]!.qualityGradeId!,
          quantity: { valueScaled: quantity, unit: "kg" },
        },
      ],
      note: null,
      evidenceReferences: ["delivery://source/001"],
    },
  }) as unknown as CreateDeliveryDraftCommand;

describe("Delivery physical truth (TC-DELIVERY-001)", () => {
  it("caps a partial Delivery against already fulfilled Sale quantity", () => {
    const result = decideCreateDeliveryDraft({
      command: command(41_000),
      sale,
      fulfilled: new Map([[sale.lines[0]!.lineId, 60_000]]),
      replacementAncestryHasFulfilment: false,
      recordedAt: "2026-07-28T02:00:01.000Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DELIVERY_QUANTITY_EXCEEDS_SALE");
  });

  it("refuses to fulfil a Sale from another quality grade", () => {
    const mismatched = command(10_000);
    mismatched.payload.lines[0]!.qualityGradeId = crypto.randomUUID() as QualityGradeId;
    const result = decideCreateDeliveryDraft({
      command: mismatched,
      sale,
      fulfilled: new Map(),
      replacementAncestryHasFulfilment: false,
      recordedAt: "2026-07-28T02:00:01.000Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DELIVERY_LINE_INVALID");
  });

  it("blocks replacement fulfilment after predecessor physical activity", () => {
    const result = decideCreateDeliveryDraft({
      command: command(10_000),
      sale: { ...sale, replacesSaleId: crypto.randomUUID() as SaleId },
      fulfilled: new Map(),
      replacementAncestryHasFulfilment: true,
      recordedAt: "2026-07-28T02:00:01.000Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DELIVERY_REPLACEMENT_FULFILMENT_BLOCKED");
  });

  it("blocks creation, editing, and dispatch after the Sale is voided", () => {
    const voidedSale = {
      ...sale,
      voidRecord: { id: crypto.randomUUID() },
    } as unknown as SaleState;
    const creation = decideCreateDeliveryDraft({
      command: command(10_000),
      sale: voidedSale,
      fulfilled: new Map(),
      replacementAncestryHasFulfilment: false,
      recordedAt: "2026-07-28T02:00:01.000Z",
    });
    expect(creation.ok).toBe(false);
    if (!creation.ok) expect(creation.error.code).toBe("SALE_ALREADY_VOIDED");

    const draft = decideCreateDeliveryDraft({
      command: command(10_000),
      sale,
      fulfilled: new Map(),
      replacementAncestryHasFulfilment: false,
      recordedAt: "2026-07-28T02:00:01.000Z",
    });
    if (!draft.ok) throw new Error("fixture failed");
    const update = decideUpdateDeliveryDraft({
      current: draft.value,
      sale: voidedSale,
      command: {
        ...command(10_000),
        expectedVersion: 1,
        payload: {
          deliveryId: draft.value.id,
          lines: command(10_000).payload.lines,
          note: null,
        },
      } as never,
      fulfilledExcludingCurrent: new Map(),
      recordedAt: "2026-07-28T02:00:02.000Z",
    });
    expect(update.ok).toBe(false);
    if (!update.ok) expect(update.error.code).toBe("SALE_ALREADY_VOIDED");

    const dispatch = decideDispatchDelivery(
      draft.value,
      voidedSale,
      {
        ...command(10_000),
        expectedVersion: 1,
        payload: { deliveryId: draft.value.id },
      } as never,
      "2026-07-28T02:00:03.000Z",
    );
    expect(dispatch.ok).toBe(false);
    if (!dispatch.ok) expect(dispatch.error.code).toBe("SALE_ALREADY_VOIDED");
  });

  it("refuses returns beyond the dispatched line", () => {
    const draft = decideCreateDeliveryDraft({
      command: command(60_000),
      sale,
      fulfilled: new Map(),
      replacementAncestryHasFulfilment: false,
      recordedAt: "2026-07-28T02:00:01.000Z",
    });
    if (!draft.ok) throw new Error("fixture failed");
    const result = decideRecordDeliveryReturn(
      { ...draft.value, status: "dispatched" },
      {
        ...command(60_000),
        payload: {
          returnId: crypto.randomUUID(),
          deliveryId: draft.value.id,
          lines: [
            {
              deliveryLineId: draft.value.lines[0]!.deliveryLineId,
              quantity: { valueScaled: 61_000, unit: "kg" },
            },
          ],
          reason: "Khách trả",
          evidenceReferences: ["return://source/001"],
        },
      } as never,
      "2026-07-28T03:00:00.000Z",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DELIVERY_RETURN_EXCEEDS_DISPATCH");
  });
});
