import { describe, expect, it } from "vitest";
import type {
  ProductId,
  PurchaseId,
  PurchaseLineId,
  RecordPurchaseReceiptCommand,
  SupplierId,
} from "@vuarau/domain-contracts";
import { calculateLineTotal } from "@vuarau/domain-contracts";
import { decideRecordPurchaseReceipt, sumMoney } from "./index.ts";
import type { PurchaseState } from "./shared/state.ts";

const vnd = (amountMinor: number) => ({ amountMinor, currency: "VND" as const });

function sequence(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1_103_515_245 + 12_345) >>> 0;
    return value;
  };
}

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

describe("canonical invariant properties", () => {
  it("TC-PROPERTY-MONEY-001 preserves integer line arithmetic across generated quantities", () => {
    const next = sequence(17);
    const totals = Array.from({ length: 250 }, () => {
      const quantity = 1 + (next() % 250_000);
      const unitPrice = next() % 2_000_000;
      const total = calculateLineTotal({ valueScaled: quantity, unit: "kg" }, vnd(unitPrice));
      const expected = Number((BigInt(quantity) * BigInt(unitPrice) + 500n) / 1_000n);
      expect(total.amountMinor).toBe(expected);
      expect(Number.isSafeInteger(total.amountMinor)).toBe(true);
      return total;
    });

    expect(sumMoney(totals, "VND").amountMinor).toBe(
      totals.reduce((sum, total) => sum + total.amountMinor, 0),
    );
  });

  it("TC-PROPERTY-INVENTORY-001 never accepts a receipt beyond the purchased quantity", () => {
    const workspaceId = id(801) as PurchaseState["workspaceId"];
    const purchaseLineId = id(802) as PurchaseLineId;
    const purchase: PurchaseState = {
      id: id(803) as PurchaseId,
      workspaceId,
      supplierId: id(804) as SupplierId,
      status: "confirmed",
      currency: "VND",
      totalAmount: vnd(1_000_000),
      note: null,
      evidenceReferences: [],
      dueAt: null,
      version: 1,
      transactionTime: "2026-08-01T02:00:00.000Z",
      recordedAt: "2026-08-01T02:00:01.000Z",
      confirmedAt: "2026-08-01T02:00:00.000Z",
      discardedAt: null,
      replacesPurchaseId: null,
      voidRecord: null,
      lines: [
        {
          lineId: purchaseLineId,
          productId: id(805) as ProductId,
          productName: "Rau property",
          quantity: { valueScaled: 100_000, unit: "kg" },
          unitPrice: vnd(10_000),
          lineTotal: vnd(1_000_000),
        },
      ],
    };
    const purchaseLine = purchase.lines[0]!;
    const next = sequence(29);
    let received = 0;
    for (let index = 0; index < 40; index += 1) {
      const requested = Math.min(1 + (next() % 7_000), 100_000 - received);
      if (requested === 0) break;
      const command = {
        commandId: id(810 + index),
        idempotencyKey: `property-receipt-${index}`,
        workspaceId,
        actorId: id(850),
        occurredAt: "2026-08-01T02:00:00.000Z",
        payload: {
          receiptId: id(900 + index),
          purchaseId: purchase.id,
          lines: [
            {
              receiptLineId: id(950 + index),
              purchaseLineId,
              productId: purchaseLine.productId,
              quantity: { valueScaled: requested, unit: "kg" },
            },
          ],
          note: null,
        },
      } as unknown as RecordPurchaseReceiptCommand;
      const result = decideRecordPurchaseReceipt({
        command,
        purchase,
        existingNetByLine: new Map([[purchaseLineId, received]]),
        recordedAt: "2026-08-01T02:00:01.000Z",
      });
      expect(result.ok).toBe(true);
      received += requested;
    }

    const over = decideRecordPurchaseReceipt({
      command: {
        commandId: id(999),
        idempotencyKey: "property-over-receipt",
        workspaceId,
        actorId: id(850),
        occurredAt: "2026-08-01T02:00:00.000Z",
        payload: {
          receiptId: id(998),
          purchaseId: purchase.id,
          lines: [
            {
              receiptLineId: id(997),
              purchaseLineId,
              productId: purchaseLine.productId,
              quantity: { valueScaled: 100_001, unit: "kg" },
            },
          ],
          note: null,
        },
      } as unknown as RecordPurchaseReceiptCommand,
      purchase,
      existingNetByLine: new Map([[purchaseLineId, 100_000]]),
      recordedAt: "2026-08-01T02:00:01.000Z",
    });
    expect(over.ok).toBe(false);
  });
});
