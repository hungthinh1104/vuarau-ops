import { describe, expect, it } from "vitest";
import type {
  RecordCustomerPaymentCommand,
  ReverseCustomerPaymentCommand,
} from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  COMMAND_ID,
  CUSTOMER_ID,
  IDEMPOTENCY_KEY,
  LATER_RECORDED_AT,
  LATER_TRANSACTION_TIME,
  LATEST_RECORDED_AT,
  LATEST_TRANSACTION_TIME,
  LEDGER_ENTRY_2_ID,
  PAYMENT_AMOUNT,
  PAYMENT_ID,
  REVERSAL_ID,
  WORKSPACE_ID,
  fullyReversedPayment,
  partiallyReversedPayment,
  recordedPayment,
  vnd,
} from "@vuarau/test-fixtures";
import {
  decideRecordPayment,
  decideReversePayment,
  derivePaymentStatus,
  remainingReversibleAmount,
} from "./index.ts";

function recordCommand(
  overrides: Partial<RecordCustomerPaymentCommand["payload"]> = {},
): RecordCustomerPaymentCommand {
  return {
    commandId: COMMAND_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: LATER_TRANSACTION_TIME,
    payload: {
      paymentId: PAYMENT_ID,
      customerId: CUSTOMER_ID,
      amount: PAYMENT_AMOUNT,
      method: "cash",
      payerName: null,
      note: null,
      ...overrides,
    },
  };
}

function reverseCommand(
  overrides: Partial<ReverseCustomerPaymentCommand["payload"]> = {},
  expectedVersion = 1,
): ReverseCustomerPaymentCommand {
  return {
    commandId: COMMAND_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: LATEST_TRANSACTION_TIME,
    expectedVersion,
    payload: {
      paymentId: PAYMENT_ID,
      reversalId: REVERSAL_ID,
      amount: PAYMENT_AMOUNT,
      reason: "Chuyển khoản bị hoàn",
      ...overrides,
    },
  };
}

describe("BR-PAYMENT-002 / TC-PAYMENT-003", () => {
  it("produces exactly one ledger effect of minus the amount", () => {
    const result = decideRecordPayment({ command: recordCommand(), recordedAt: LATER_RECORDED_AT });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.ledgerEntries).toHaveLength(1);
    const entry = result.value.ledgerEntries[0]!;
    expect(entry.amount.amountMinor).toBe(-PAYMENT_AMOUNT.amountMinor);
    expect(entry.sourceType).toBe("payment");
    expect(entry.sourceId).toBe(PAYMENT_ID);
    expect(entry.reversalOfEntryId).toBeNull();
  });

  it("starts the payment at version 1 with nothing reversed", () => {
    const result = decideRecordPayment({ command: recordCommand(), recordedAt: LATER_RECORDED_AT });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.aggregate.version).toBe(1);
    expect(result.value.aggregate.status).toBe("recorded");
    expect(result.value.aggregate.reversedAmount.amountMinor).toBe(0);
  });
});

describe("BR-PAYMENT-001 / TC-PAYMENT-003", () => {
  it("refuses a zero payment", () => {
    const result = decideRecordPayment({
      command: recordCommand({ amount: vnd(0) }),
      recordedAt: LATER_RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PAYMENT_AMOUNT_INVALID");
  });

  it("refuses a negative payment — a debt increase in disguise", () => {
    const result = decideRecordPayment({
      command: recordCommand({ amount: vnd(-1) }),
      recordedAt: LATER_RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PAYMENT_AMOUNT_INVALID");
  });
});

describe("BR-ACCOUNT-007 / TC-PAYMENT-011", () => {
  it("accepts a payment larger than any plausible debt (ASM-001)", () => {
    // CASE-PAYMENT-003. The kernel is not given a balance at all: there is no
    // clamping and no guard, which is precisely the assumption being recorded.
    const result = decideRecordPayment({
      command: recordCommand({ amount: vnd(999_999_999) }),
      recordedAt: LATER_RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ledgerEntries[0]!.amount.amountMinor).toBe(-999_999_999);
  });
});

describe("BR-PAYMENT-005 / TC-PAYMENT-004", () => {
  it("creates a compensating ledger entry, not a second payment", () => {
    const result = decideReversePayment({
      command: reverseCommand(),
      payment: recordedPayment,
      originalLedgerEntryId: LEDGER_ENTRY_2_ID,
      recordedAt: LATEST_RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.ledgerEntries).toHaveLength(1);
    const entry = result.value.ledgerEntries[0]!;
    expect(entry.amount.amountMinor).toBe(PAYMENT_AMOUNT.amountMinor);
    expect(entry.sourceType).toBe("payment_reversal");
    expect(entry.sourceId).toBe(REVERSAL_ID);
    // The link back to what it offsets is what makes the pair readable later.
    expect(entry.reversalOfEntryId).toBe(LEDGER_ENTRY_2_ID);
  });

  it("preserves the original payment's amount and identity", () => {
    const result = decideReversePayment({
      command: reverseCommand(),
      payment: recordedPayment,
      originalLedgerEntryId: LEDGER_ENTRY_2_ID,
      recordedAt: LATEST_RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { payment, reversal } = result.value.aggregate;
    expect(payment.id).toBe(recordedPayment.id);
    expect(payment.amount).toEqual(recordedPayment.amount);
    expect(payment.transactionTime).toBe(recordedPayment.transactionTime);
    expect(reversal.id).toBe(REVERSAL_ID);
    expect(reversal.reason).toBe("Chuyển khoản bị hoàn");
  });

  it("records the reversal at its own business time, not the payment's", () => {
    const result = decideReversePayment({
      command: reverseCommand(),
      payment: recordedPayment,
      originalLedgerEntryId: LEDGER_ENTRY_2_ID,
      recordedAt: LATEST_RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ledgerEntries[0]!.transactionTime).toBe(LATEST_TRANSACTION_TIME);
    expect(result.value.ledgerEntries[0]!.recordedAt).toBe(LATEST_RECORDED_AT);
  });
});

describe("BR-PAYMENT-003 / TC-PAYMENT-007", () => {
  it("refuses a reversal larger than the remaining reversible amount", () => {
    // CASE-PAYMENT-010: 500 000 recorded, 200 000 already reversed, 300 000 left.
    const result = decideReversePayment({
      command: reverseCommand({ amount: vnd(300_001) }, partiallyReversedPayment.version),
      payment: partiallyReversedPayment,
      originalLedgerEntryId: LEDGER_ENTRY_2_ID,
      recordedAt: LATEST_RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT");
    expect(result.error.details).toMatchObject({ requested: 300_001, remaining: 300_000 });
  });

  it("allows a reversal of exactly the remaining amount", () => {
    const result = decideReversePayment({
      command: reverseCommand({ amount: vnd(300_000) }, partiallyReversedPayment.version),
      payment: partiallyReversedPayment,
      originalLedgerEntryId: LEDGER_ENTRY_2_ID,
      recordedAt: LATEST_RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aggregate.payment.status).toBe("reversed");
  });

  it("reports the remaining reversible amount", () => {
    expect(remainingReversibleAmount(partiallyReversedPayment).amountMinor).toBe(300_000);
    expect(remainingReversibleAmount(recordedPayment).amountMinor).toBe(500_000);
    expect(remainingReversibleAmount(fullyReversedPayment).amountMinor).toBe(0);
  });
});

describe("BR-PAYMENT-006 / TC-PAYMENT-008", () => {
  it("refuses to reverse a fully reversed payment", () => {
    const result = decideReversePayment({
      command: reverseCommand({ amount: vnd(1) }, fullyReversedPayment.version),
      payment: fullyReversedPayment,
      originalLedgerEntryId: LEDGER_ENTRY_2_ID,
      recordedAt: LATEST_RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PAYMENT_ALREADY_REVERSED");
  });
});

describe("BR-PAYMENT-004 / TC-PAYMENT-009", () => {
  it("refuses a reversal with a blank reason", () => {
    const result = decideReversePayment({
      command: reverseCommand({ reason: "   " }),
      payment: recordedPayment,
      originalLedgerEntryId: LEDGER_ENTRY_2_ID,
      recordedAt: LATEST_RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PAYMENT_REVERSAL_REASON_REQUIRED");
  });

  it("carries the reason onto the audit record", () => {
    const result = decideReversePayment({
      command: reverseCommand({ reason: "Khách báo chưa nhận được tiền" }),
      payment: recordedPayment,
      originalLedgerEntryId: LEDGER_ENTRY_2_ID,
      recordedAt: LATEST_RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.audit.reason).toBe("Khách báo chưa nhận được tiền");
  });
});

describe("BR-PAYMENT-007 / TC-PAYMENT-006", () => {
  it("refuses a reversal carrying a stale version", () => {
    const result = decideReversePayment({
      command: reverseCommand({}, 1),
      payment: { ...recordedPayment, version: 3 },
      originalLedgerEntryId: LEDGER_ENTRY_2_ID,
      recordedAt: LATEST_RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PAYMENT_VERSION_CONFLICT");
    expect(result.error.details).toMatchObject({ expectedVersion: 1, actualVersion: 3 });
  });
});

describe("BR-PAYMENT-008 / TC-PAYMENT-010", () => {
  it("derives the status from the reversed amount", () => {
    expect(derivePaymentStatus(vnd(500_000), vnd(0))).toBe("recorded");
    expect(derivePaymentStatus(vnd(500_000), vnd(200_000))).toBe("partially_reversed");
    expect(derivePaymentStatus(vnd(500_000), vnd(500_000))).toBe("reversed");
  });

  it("moves a fully-reversed-in-one-step payment straight to reversed", () => {
    const result = decideReversePayment({
      command: reverseCommand(),
      payment: recordedPayment,
      originalLedgerEntryId: LEDGER_ENTRY_2_ID,
      recordedAt: LATEST_RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aggregate.payment.status).toBe("reversed");
    expect(result.value.aggregate.payment.reversedAmount.amountMinor).toBe(500_000);
    expect(result.value.aggregate.payment.version).toBe(recordedPayment.version + 1);
  });

  it("moves a partially reversed payment to partially_reversed and accumulates", () => {
    const result = decideReversePayment({
      command: reverseCommand({ amount: vnd(100_000) }, partiallyReversedPayment.version),
      payment: partiallyReversedPayment,
      originalLedgerEntryId: LEDGER_ENTRY_2_ID,
      recordedAt: LATEST_RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aggregate.payment.status).toBe("partially_reversed");
    expect(result.value.aggregate.payment.reversedAmount.amountMinor).toBe(300_000);
  });
});
