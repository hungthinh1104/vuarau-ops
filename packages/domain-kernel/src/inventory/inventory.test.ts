import { describe, expect, it } from "vitest";
import type {
  ProductId,
  AdjustInventoryCommand,
  PurchaseId,
  PurchaseLineId,
  PurchaseReceiptId,
  RecordPurchaseReceiptCommand,
} from "@vuarau/domain-contracts";
import type { PurchaseState } from "../shared/state.ts";
import { decideRecordPurchaseReceipt, validateInventoryAdjustment } from "./index.ts";

const purchase = {
  id: crypto.randomUUID() as PurchaseId,
  workspaceId: crypto.randomUUID(),
  supplierId: crypto.randomUUID(),
  status: "confirmed",
  currency: "VND",
  lines: [
    {
      lineId: crypto.randomUUID() as PurchaseLineId,
      productId: crypto.randomUUID() as ProductId,
      productName: "Rau",
      quantity: { valueScaled: 100_000, unit: "kg" },
      unitPrice: { amountMinor: 10_000, currency: "VND" },
      lineTotal: { amountMinor: 1_000_000, currency: "VND" },
    },
  ],
  totalAmount: { amountMinor: 1_000_000, currency: "VND" },
  note: null,
  dueAt: null,
  version: 2,
  transactionTime: "2026-07-29T00:00:00.000Z",
  recordedAt: "2026-07-29T00:00:01.000Z",
  confirmedAt: "2026-07-29T00:00:01.000Z",
  discardedAt: null,
  replacesPurchaseId: null,
  voidRecord: null,
} as unknown as PurchaseState;

const receipt = (quantity: number): RecordPurchaseReceiptCommand =>
  ({
    commandId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    workspaceId: purchase.workspaceId,
    actorId: crypto.randomUUID(),
    occurredAt: "2026-07-29T02:00:00.000Z",
    payload: {
      receiptId: crypto.randomUUID() as PurchaseReceiptId,
      purchaseId: purchase.id,
      lines: [
        {
          receiptLineId: crypto.randomUUID(),
          purchaseLineId: purchase.lines[0]!.lineId,
          productId: purchase.lines[0]!.productId,
          quantity: { valueScaled: quantity, unit: "kg" },
        },
      ],
      note: null,
    },
  }) as unknown as RecordPurchaseReceiptCommand;

describe("Receiving and inventory decisions", () => {
  it("supports partial receipts and rejects net over-receiving", () => {
    const partial = decideRecordPurchaseReceipt({
      command: receipt(40_000),
      purchase,
      existingNetByLine: new Map(),
      recordedAt: "2026-07-29T02:00:01.000Z",
    });
    expect(partial.ok).toBe(true);
    const over = decideRecordPurchaseReceipt({
      command: receipt(61_000),
      purchase,
      existingNetByLine: new Map([[purchase.lines[0]!.lineId, 40_000]]),
      recordedAt: "2026-07-29T02:00:01.000Z",
    });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error.code).toBe("RECEIPT_QUANTITY_EXCEEDS_PURCHASE");
  });

  it("keeps a physical decrease signed and allows negative projected inventory", () => {
    const result = validateInventoryAdjustment({
      commandId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      workspaceId: purchase.workspaceId,
      actorId: crypto.randomUUID(),
      occurredAt: "2026-07-29T02:00:00.000Z",
      payload: {
        adjustmentId: crypto.randomUUID(),
        productId: purchase.lines[0]!.productId,
        quantity: { valueScaled: 5_000, unit: "kg" },
        direction: "decrease",
        reasonCode: "count_correction",
        reason: "Kiểm đếm thực tế",
      },
    } as unknown as AdjustInventoryCommand);
    expect(result.ok && result.value).toBe(-5_000);
  });
});
