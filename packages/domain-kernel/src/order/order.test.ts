import { describe, expect, it } from "vitest";
import type { ConfirmOrderCommand, CreateOrderCommand } from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  COMMAND_ID,
  CUSTOMER_ID,
  IDEMPOTENCY_KEY,
  ORDER_ID,
  ORDER_TOTAL,
  RECORDED_AT,
  TRANSACTION_TIME,
  WORKSPACE_ID,
  confirmedOrder,
  emptyDraftOrder,
  invalidOrderLineInput,
  orderLineInputs,
  validDraftOrder,
  vnd,
} from "@vuarau/test-fixtures";
import { decideConfirmOrder, decideCreateOrder } from "./index.ts";
import { calculateLineTotal } from "../shared/quantity.ts";

function createOrderCommand(
  overrides: Partial<CreateOrderCommand["payload"]> = {},
): CreateOrderCommand {
  return {
    commandId: COMMAND_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: TRANSACTION_TIME,
    payload: {
      orderId: ORDER_ID,
      customerId: CUSTOMER_ID,
      currency: "VND",
      lines: [...orderLineInputs],
      note: null,
      ...overrides,
    },
  };
}

function confirmOrderCommand(expectedVersion: number): ConfirmOrderCommand {
  return {
    commandId: COMMAND_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: TRANSACTION_TIME,
    expectedVersion,
    payload: { orderId: ORDER_ID },
  };
}

describe("BR-SALE-001 / TC-SALE-001", () => {
  it("sets the order total to the sum of its line totals", () => {
    const result = decideCreateOrder({ command: createOrderCommand(), recordedAt: RECORDED_AT });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { aggregate } = result.value;
    const summed = aggregate.lines.reduce((total, line) => total + line.lineTotal.amountMinor, 0);

    expect(aggregate.totalAmount.amountMinor).toBe(summed);
    expect(aggregate.totalAmount).toEqual(ORDER_TOTAL);
  });

  it("ignores any total the caller might have believed in", () => {
    // CASE-SALE-001 — the client sends lines, never a total. There is no field
    // for one, which is the strongest form this rule can take.
    const result = decideCreateOrder({ command: createOrderCommand(), recordedAt: RECORDED_AT });
    expect(result.ok && result.value.aggregate.totalAmount.amountMinor).toBe(875_000);
  });
});

describe("BR-SALE-004 / TC-SALE-002", () => {
  it("rounds a fractional line total half-up on the minor unit", () => {
    // 1,5 kg at 12 345 ₫/kg = 18 517,5 ₫ exactly — the half-way case.
    const total = calculateLineTotal({ valueScaled: 1_500, unit: "kg" }, vnd(12_345));
    expect(total.amountMinor).toBe(18_518);
  });

  it("computes whole-unit quantities exactly", () => {
    expect(calculateLineTotal({ valueScaled: 30_000, unit: "bo" }, vnd(5_000)).amountMinor).toBe(
      150_000,
    );
  });

  it("computes the casebook's fractional line exactly", () => {
    // 12,5 kg × 18 000 = 225 000 ₫ — no rounding needed, but it goes through the
    // fractional path, so a bug there would show up here.
    expect(calculateLineTotal({ valueScaled: 12_500, unit: "kg" }, vnd(18_000)).amountMinor).toBe(
      225_000,
    );
  });

  it("stays exact at magnitudes where a naive product would lose precision", () => {
    // 1 000 000,5 units at 10 000 000 ₫ — the intermediate product of a naive
    // implementation exceeds Number.MAX_SAFE_INTEGER; this must still be exact.
    const total = calculateLineTotal({ valueScaled: 1_000_000_500, unit: "kg" }, vnd(10_000_000));
    expect(total.amountMinor).toBe(10_000_005_000_000);
    expect(Number.isSafeInteger(total.amountMinor)).toBe(true);
  });

  it("rounds a half-way remainder up, not to even", () => {
    // 0,5 kg at 1 ₫/kg = 0,5 ₫ → 1 ₫ (half-up), not 0 ₫ (half-to-even).
    expect(calculateLineTotal({ valueScaled: 500, unit: "kg" }, vnd(1)).amountMinor).toBe(1);
  });
});

describe("BR-SALE-007 / TC-SALE-003", () => {
  it("produces exactly one debt ledger effect when a valid order is confirmed", () => {
    const result = decideConfirmOrder({
      command: confirmOrderCommand(validDraftOrder.version),
      order: validDraftOrder,
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.ledgerEntries).toHaveLength(1);

    const entry = result.value.ledgerEntries[0]!;
    expect(entry.amount).toEqual(ORDER_TOTAL);
    expect(entry.sourceType).toBe("order_confirmation");
    expect(entry.sourceId).toBe(validDraftOrder.id);
    expect(entry.customerId).toBe(validDraftOrder.customerId);
    expect(entry.workspaceId).toBe(WORKSPACE_ID);
  });

  it("stamps the ledger entry with the business time, not the recording time", () => {
    // CASE-SALE-006 — the sale happened at 05:00 and was typed at 11:00.
    const result = decideConfirmOrder({
      command: confirmOrderCommand(validDraftOrder.version),
      order: validDraftOrder,
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const entry = result.value.ledgerEntries[0]!;
    expect(entry.transactionTime).toBe(TRANSACTION_TIME);
    expect(entry.recordedAt).toBe(RECORDED_AT);
    expect(entry.transactionTime).not.toBe(entry.recordedAt);
  });

  it("attributes the entry to the actor and the command", () => {
    const result = decideConfirmOrder({
      command: confirmOrderCommand(validDraftOrder.version),
      order: validDraftOrder,
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const entry = result.value.ledgerEntries[0]!;
    expect(entry.actorId).toBe(ACTOR_ID);
    expect(entry.commandId).toBe(COMMAND_ID);
  });

  it("moves the order to confirmed and increments the version by exactly one", () => {
    const result = decideConfirmOrder({
      command: confirmOrderCommand(validDraftOrder.version),
      order: validDraftOrder,
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.aggregate.status).toBe("confirmed");
    expect(result.value.aggregate.version).toBe(validDraftOrder.version + 1);
    expect(result.value.aggregate.confirmedAt).toBe(TRANSACTION_TIME);
  });
});

describe("BR-SALE-002 / TC-SALE-006", () => {
  it("refuses to confirm an order with no lines", () => {
    const result = decideConfirmOrder({
      command: confirmOrderCommand(emptyDraftOrder.version),
      order: emptyDraftOrder,
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ORDER_EMPTY");
    expect(result.error.retryable).toBe(false);
  });

  it("still allows an empty draft to exist — the worker is mid-entry", () => {
    const result = decideCreateOrder({
      command: createOrderCommand({ lines: [] }),
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aggregate.status).toBe("draft");
    expect(result.value.aggregate.totalAmount.amountMinor).toBe(0);
    expect(result.value.ledgerEntries).toHaveLength(0);
  });
});

describe("BR-SALE-003 / TC-SALE-007", () => {
  it("refuses a line with zero quantity and says which line", () => {
    const result = decideCreateOrder({
      command: createOrderCommand({ lines: [invalidOrderLineInput] }),
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ORDER_LINE_INVALID");
    expect(result.error.details).toMatchObject({
      lineIndex: 0,
      lineId: invalidOrderLineInput.lineId,
    });
  });

  it("refuses a line with a negative unit price", () => {
    const result = decideCreateOrder({
      command: createOrderCommand({
        lines: [{ ...orderLineInputs[0]!, unitPrice: vnd(-1) }],
      }),
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ORDER_LINE_INVALID");
  });

  it("accepts a zero unit price — depots do give things away", () => {
    const result = decideCreateOrder({
      command: createOrderCommand({
        lines: [{ ...orderLineInputs[0]!, unitPrice: vnd(0) }],
      }),
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aggregate.totalAmount.amountMinor).toBe(0);
  });

  it("refuses a blank product name", () => {
    const result = decideCreateOrder({
      command: createOrderCommand({
        lines: [{ ...orderLineInputs[0]!, productName: "   " }],
      }),
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ORDER_LINE_INVALID");
  });
});

describe("BR-SALE-005 / TC-SALE-008", () => {
  it("refuses to confirm an order that is already confirmed", () => {
    // CASE-SALE-003 — a deliberate second confirmation, not a retry. A retry
    // never reaches the domain; the idempotency layer answers it (BR-COMMAND-001).
    const result = decideConfirmOrder({
      command: confirmOrderCommand(confirmedOrder.version),
      order: confirmedOrder,
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ORDER_ALREADY_CONFIRMED");
    expect(result.error.details).toMatchObject({ status: "confirmed" });
  });

  it("produces no ledger effect when refusing", () => {
    const result = decideConfirmOrder({
      command: confirmOrderCommand(confirmedOrder.version),
      order: confirmedOrder,
      recordedAt: RECORDED_AT,
    });
    expect(result.ok).toBe(false);
  });
});

describe("BR-SALE-006 / TC-SALE-005", () => {
  it("refuses a confirmation carrying a stale version, reporting both versions", () => {
    // CASE-SALE-004 — phone B still believes the order is at version 1.
    const result = decideConfirmOrder({
      command: confirmOrderCommand(1),
      order: { ...validDraftOrder, version: 2 },
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ORDER_VERSION_CONFLICT");
    expect(result.error.details).toMatchObject({ expectedVersion: 1, actualVersion: 2 });
    // A blind retry would re-apply an intent formed against stale data (ADR-0009).
    expect(result.error.retryable).toBe(false);
  });
});

describe("BR-SALE-009 / TC-SALE-010", () => {
  it("refuses a line whose currency differs from the order's", () => {
    const result = decideCreateOrder({
      command: createOrderCommand({
        lines: [
          orderLineInputs[0]!,
          { ...orderLineInputs[1]!, unitPrice: { amountMinor: 5_000, currency: "USD" as never } },
        ],
      }),
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ORDER_CURRENCY_MISMATCH");
  });
});
