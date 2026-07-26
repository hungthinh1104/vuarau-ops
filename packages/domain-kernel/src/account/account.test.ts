import { describe, expect, it } from "vitest";
import { DEBT_ADJUSTMENT_REASON_CODES } from "@vuarau/domain-contracts";
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
import {
  buildAccountBalance,
  calculateAccountBalance,
  classifyBalance,
  decideAdjustDebt,
} from "./index.ts";

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

describe("BR-ACCOUNT-001 / TC-ACCOUNT-001", () => {
  it("computes the balance as the sum of the ledger entries", () => {
    // CASE-ACCOUNT-001 + CASE-ACCOUNT-002: +875 000 then −500 000.
    const balance = calculateAccountBalance(ledgerWithOrderAndPayment, "VND");
    expect(balance.amountMinor).toBe(375_000);
  });

  it("is zero for a customer with no entries — not because a zero was stored", () => {
    expect(calculateAccountBalance([], "VND").amountMinor).toBe(0);
  });

  it("builds a summary whose balance equals the sum, entry for entry", () => {
    const summary = buildAccountBalance({
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
    const summary = buildAccountBalance({
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      entries: ledgerWithOrderAndPayment,
      currency: "VND",
      updatedAt: RECORDED_AT,
    });

    expect(summary.lastEntryTransactionTime).toBe(paymentEntry.transactionTime);
  });

  it("gives the same answer whatever sale the entries arrive in", () => {
    // The rebuild path (BR-ACCOUNT-006) reads rows in index sale, which is not the
    // sale they were written. A sum that depended on that would drift.
    const forwards = calculateAccountBalance([orderConfirmationEntry, paymentEntry], "VND");
    const backwards = calculateAccountBalance([paymentEntry, orderConfirmationEntry], "VND");
    expect(forwards).toEqual(backwards);
  });
});

describe("BR-ACCOUNT-007 / TC-ACCOUNT-007", () => {
  it("allows the balance to go negative — the customer is in credit (ASM-001)", () => {
    // CASE-PAYMENT-003: an overpayment against a 375 000 ₫ balance.
    const overpayment = { ...paymentEntry, amount: vnd(-1_000_000) };
    const balance = calculateAccountBalance([orderConfirmationEntry, overpayment], "VND");
    expect(balance.amountMinor).toBe(-125_000);
  });
});

describe("BR-ACCOUNT-003 / TC-ACCOUNT-003", () => {
  it("refuses an adjustment with a blank reason", () => {
    // CASE-ACCOUNT-006.
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
    const entry = result.value.accountEntries[0]!;
    expect(entry.reason).toBe("Nợ cũ từ sổ giấy");
    expect(entry.reasonCode).toBe("opening_balance");
  });
});

describe("BR-ACCOUNT-008 / TC-ACCOUNT-003", () => {
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

describe("BR-ACCOUNT-002 / TC-ACCOUNT-006", () => {
  it("signs the entry from the direction, not from the amount", () => {
    // CASE-ACCOUNT-004 and CASE-ACCOUNT-005.
    const increase = decideAdjustDebt({
      command: adjustCommand({ direction: "increase" }),
      recordedAt: RECORDED_AT,
    });
    const decrease = decideAdjustDebt({
      command: adjustCommand({ direction: "decrease", reasonCode: "goodwill_discount" }),
      recordedAt: RECORDED_AT,
    });

    expect(increase.ok && increase.value.accountEntries[0]!.amount.amountMinor).toBe(50_000);
    expect(decrease.ok && decrease.value.accountEntries[0]!.amount.amountMinor).toBe(-50_000);
  });

  it("produces exactly one ledger entry and no aggregate change", () => {
    const result = decideAdjustDebt({ command: adjustCommand(), recordedAt: RECORDED_AT });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.accountEntries).toHaveLength(1);
    expect(result.value.accountEntries[0]!.sourceType).toBe("manual_adjustment");
    expect(result.value.accountEntries[0]!.sourceId).toBe(ADJUSTMENT_ID);
    expect(result.value.aggregate).toBeNull();
  });
});

describe("BR-ACCOUNT-004 / TC-ACCOUNT-004", () => {
  it("attributes every adjustment entry to an actor and a command", () => {
    const result = decideAdjustDebt({ command: adjustCommand(), recordedAt: RECORDED_AT });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = result.value.accountEntries[0]!;
    expect(entry.actorId).toBe(ACTOR_ID);
    expect(entry.commandId).toBe(COMMAND_ID);
    expect(entry.transactionTime).toBe(TRANSACTION_TIME);
    expect(entry.recordedAt).toBe(RECORDED_AT);
  });
});

describe("BR-ACCOUNT-009 / TC-ACCOUNT-010", () => {
  it("classifies a positive balance as a receivable", () => {
    expect(classifyBalance(vnd(875_000))).toBe("receivable");
    expect(classifyBalance(vnd(1))).toBe("receivable");
  });

  it("classifies exactly zero as settled, not as empty", () => {
    // A customer with a full history who owes nothing is a fact worth stating.
    // Rendering this as a blank panel is a UI bug this classification prevents.
    expect(classifyBalance(vnd(0))).toBe("settled");
  });

  it("classifies a negative balance as customer credit, never as a debt", () => {
    // The one that goes wrong in a UI: −400 000 rendered as "nợ −400.000" sends a
    // worker to collect money from somebody the depot owes.
    expect(classifyBalance(vnd(-400_000))).toBe("customer_credit");
    expect(classifyBalance(vnd(-1))).toBe("customer_credit");
  });

  it("agrees with the sign of the balance for every case, by construction", () => {
    for (const minor of [-1_000_000, -1, 0, 1, 1_000_000]) {
      const classification = classifyBalance(vnd(minor));
      expect(classification).toBe(
        minor > 0 ? "receivable" : minor < 0 ? "customer_credit" : "settled",
      );
    }
  });
});

describe("BR-ACCOUNT-010 / TC-ACCOUNT-011", () => {
  it("offers reason codes only for movements with no underlying document", () => {
    // The list is the rule (BR-ACCOUNT-010). Correcting a posted sale is not on
    // it — that is VoidSale plus an optional replacement (ADR-0012) — and a code
    // named for it must never appear here, however convenient it would be.
    expect([...DEBT_ADJUSTMENT_REASON_CODES]).toEqual([
      "opening_balance",
      "write_off",
      "dispute_settlement",
      "migration_correction",
      "data_entry_correction",
      "goodwill_discount",
      "other",
    ]);

    for (const code of DEBT_ADJUSTMENT_REASON_CODES) {
      expect(code).not.toMatch(/sale|void|order/i);
    }
  });
});
