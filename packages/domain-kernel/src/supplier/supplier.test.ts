import { describe, expect, it } from "vitest";
import type {
  RecordSupplierPaymentCommand,
  ReverseSupplierPaymentCommand,
  SupplierId,
  SupplierPaymentId,
} from "@vuarau/domain-contracts";
import { decideRecordSupplierPayment, decideReverseSupplierPayment } from "./index.ts";

const base = {
  commandId: crypto.randomUUID(),
  idempotencyKey: "supplier-domain",
  workspaceId: crypto.randomUUID(),
  actorId: crypto.randomUUID(),
  occurredAt: "2026-07-29T00:00:00.000Z",
};

describe("Supplier money decisions", () => {
  it("records a positive cash-out document and permits overpayment", () => {
    const result = decideRecordSupplierPayment(
      {
        ...base,
        payload: {
          supplierPaymentId: crypto.randomUUID() as SupplierPaymentId,
          supplierId: crypto.randomUUID() as SupplierId,
          amount: { amountMinor: 500_000, currency: "VND" },
          method: "cash",
          note: null,
        },
      } as RecordSupplierPaymentCommand,
      "2026-07-29T00:00:01.000Z",
    );
    expect(result.ok && result.value.amount.amountMinor).toBe(500_000);
  });

  it("rejects zero payment and reversal beyond the remaining amount", () => {
    const paymentCommand = {
      ...base,
      payload: {
        supplierPaymentId: crypto.randomUUID() as SupplierPaymentId,
        supplierId: crypto.randomUUID() as SupplierId,
        amount: { amountMinor: 100, currency: "VND" },
        method: "cash",
        note: null,
      },
    } as RecordSupplierPaymentCommand;
    const recorded = decideRecordSupplierPayment(paymentCommand, "2026-07-29T00:00:01.000Z");
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    const reversed = decideReverseSupplierPayment(recorded.value, {
      ...base,
      expectedVersion: 1,
      payload: {
        reversalId: crypto.randomUUID(),
        supplierPaymentId: recorded.value.id,
        amount: { amountMinor: 101, currency: "VND" },
        reason: "Sai tiền",
      },
    } as ReverseSupplierPaymentCommand);
    expect(reversed.ok).toBe(false);
    if (!reversed.ok)
      expect(reversed.error.code).toBe("SUPPLIER_PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT");
  });
});
