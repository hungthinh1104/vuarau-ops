import { describe, expect, it } from "vitest";
import type { AdjustCustomerDebtCommand } from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  ADJUSTMENT_ID,
  COMMAND_ID,
  CUSTOMER_ID,
  IDEMPOTENCY_KEY,
  RECORDED_AT,
  TRANSACTION_TIME,
  WORKSPACE_ID,
  ledgerWithOrderAndPayment,
  orderConfirmationEntry,
  paymentEntry,
  vnd,
} from "@vuarau/test-fixtures";
import { calculateDebtBalance, decideAdjustDebt, buildDebtSummary } from "./index.ts";

function adjustCommand(
  overrides: Partial<AdjustCustomerDebtCommand["payload"]> = {},
): AdjustCustomerDebtCommand {
  return {
    commandId: COMMAND_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: TRANSACTION_TIME,
    payload: {
      adjustmentId: ADJUSTMENT_ID,
      customerId: CUSTOMER_ID,
      direction: "increase",
      amount: vnd(50_000),
      reasonCode: "opening_balance",
      reason: "Nợ cũ từ sổ giấy",
      ...overrides,
    },
  };
}

describe("BR-DEBT-001 / TC-DEBT-001", () => {
  it("computes the balance as the sum of the ledger entries", () => {
    // CASE-DEBT-001 + CASE-DEBT-002: +875 000 then −500 000.
    const balance = calculateDebtBalance(ledgerWithOrderAndPayment, "VND");
    expect(balance.amountMinor).toBe(375_000);
  });

  it("is zero for a customer with no entries — not because a zero was stored", () => {
    expect(calculateDebtBalance([], "VND").amountMinor).toBe(0);
  });

  it("builds a summary whose balance equals the sum, entry for entry", () => {
    const summary = buildDebtSummary({
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      entries: ledgerWithOrderAndPayment,
      currency: "VND",
      updatedAt: RECORDED_AT,
    });

    const sum = ledgerWithOrderAndPayment.reduce((t, e) => t + e.amount.amountMinor, 0);
    expect(summary.balance.amountMinor).toBe(sum);
    expect(summary.entryCount).toBe(2);
  });

  it("reports the latest entry's transaction time, not its recording time", () => {
    const summary = buildDebtSummary({
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      entries: ledgerWithOrderAndPayment,
      currency: "VND",
      updatedAt: RECORDED_AT,
    });

    expect(summary.lastEntryTransactionTime).toBe(paymentEntry.transactionTime);
  });

  it("gives the same answer whatever order the entries arrive in", () => {
    // The rebuild path (BR-DEBT-006) reads rows in index order, which is not the
    // order they were written. A sum that depended on that would drift.
    const forwards = calculateDebtBalance([orderConfirmationEntry, paymentEntry], "VND");
    const backwards = calculateDebtBalance([paymentEntry, orderConfirmationEntry], "VND");
    expect(forwards).toEqual(backwards);
  });
});

describe("BR-DEBT-007 / TC-DEBT-007", () => {
  it("allows the balance to go negative — the customer is in credit (ASM-001)", () => {
    // CASE-PAYMENT-003: an overpayment against a 375 000 ₫ balance.
    const overpayment = { ...paymentEntry, amount: vnd(-1_000_000) };
    const balance = calculateDebtBalance([orderConfirmationEntry, overpayment], "VND");
    expect(balance.amountMinor).toBe(-125_000);
  });
});

describe("BR-DEBT-003 / TC-DEBT-003", () => {
  it("refuses an adjustment with a blank reason", () => {
    // CASE-DEBT-006.
    const result = decideAdjustDebt({
      command: adjustCommand({ reason: "   " }),
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DEBT_ADJUSTMENT_REASON_REQUIRED");
  });

  it("refuses an adjustment with an empty reason", () => {
    const result = decideAdjustDebt({
      command: adjustCommand({ reason: "" }),
      recordedAt: RECORDED_AT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DEBT_ADJUSTMENT_REASON_REQUIRED");
  });

  it("writes the reason onto the ledger entry itself, not only the audit log", () => {
    // Someone reading the debt book six months later must see why the number
    // moved without joining another table.
    const result = decideAdjustDebt({ command: adjustCommand(), recordedAt: RECORDED_AT });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = result.value.ledgerEntries[0]!;
    expect(entry.reason).toBe("Nợ cũ từ sổ giấy");
    expect(entry.reasonCode).toBe("opening_balance");
  });
});

describe("BR-DEBT-008 / TC-DEBT-003", () => {
  it("refuses a zero adjustment", () => {
    const result = decideAdjustDebt({
      command: adjustCommand({ amount: vnd(0) }),
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DEBT_ADJUSTMENT_AMOUNT_INVALID");
  });

  it("refuses a negative amount — direction says which way, not the sign", () => {
    const result = decideAdjustDebt({
      command: adjustCommand({ amount: vnd(-50_000) }),
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DEBT_ADJUSTMENT_AMOUNT_INVALID");
  });
});

describe("BR-DEBT-002 / TC-DEBT-006", () => {
  it("signs the entry from the direction, not from the amount", () => {
    // CASE-DEBT-004 and CASE-DEBT-005.
    const increase = decideAdjustDebt({
      command: adjustCommand({ direction: "increase" }),
      recordedAt: RECORDED_AT,
    });
    const decrease = decideAdjustDebt({
      command: adjustCommand({ direction: "decrease", reasonCode: "goodwill_discount" }),
      recordedAt: RECORDED_AT,
    });

    expect(increase.ok && increase.value.ledgerEntries[0]!.amount.amountMinor).toBe(50_000);
    expect(decrease.ok && decrease.value.ledgerEntries[0]!.amount.amountMinor).toBe(-50_000);
  });

  it("produces exactly one ledger entry and no aggregate change", () => {
    const result = decideAdjustDebt({ command: adjustCommand(), recordedAt: RECORDED_AT });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ledgerEntries).toHaveLength(1);
    expect(result.value.ledgerEntries[0]!.sourceType).toBe("manual_adjustment");
    expect(result.value.ledgerEntries[0]!.sourceId).toBe(ADJUSTMENT_ID);
    expect(result.value.aggregate).toBeNull();
  });
});

describe("BR-DEBT-004 / TC-DEBT-004", () => {
  it("attributes every adjustment entry to an actor and a command", () => {
    const result = decideAdjustDebt({ command: adjustCommand(), recordedAt: RECORDED_AT });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = result.value.ledgerEntries[0]!;
    expect(entry.actorId).toBe(ACTOR_ID);
    expect(entry.commandId).toBe(COMMAND_ID);
    expect(entry.transactionTime).toBe(TRANSACTION_TIME);
    expect(entry.recordedAt).toBe(RECORDED_AT);
  });
});
