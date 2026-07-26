import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  COMMAND_ID,
  CUSTOMER_ID,
  IDEMPOTENCY_KEY,
  LATER_TRANSACTION_TIME,
  LATEST_TRANSACTION_TIME,
  OTHER_IDEMPOTENCY_KEY,
  PAYMENT_AMOUNT,
  PAYMENT_ID,
  REVERSAL_ID,
  SECOND_COMMAND_ID,
  THIRD_COMMAND_ID,
  WORKSPACE_ID,
  vnd,
} from "@vuarau/test-fixtures";
import { createHarness, ledgerBalance, type Harness } from "../../testing/command-test-harness.ts";
import { recordCustomerPayment } from "./record-payment.handler.ts";
import { reverseCustomerPayment } from "./reverse-payment.handler.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

const recordInput = (overrides: Record<string, unknown> = {}) => ({
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
  },
  ...overrides,
});

const reverseInput = (overrides: Record<string, unknown> = {}) => ({
  commandId: SECOND_COMMAND_ID,
  idempotencyKey: OTHER_IDEMPOTENCY_KEY,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: LATEST_TRANSACTION_TIME,
  expectedVersion: 1,
  payload: {
    paymentId: PAYMENT_ID,
    reversalId: REVERSAL_ID,
    amount: PAYMENT_AMOUNT,
    reason: "Chuyển khoản bị hoàn",
  },
  ...overrides,
});

describe("BR-PAYMENT-002 / TC-PAYMENT-001", () => {
  it("reduces the customer's debt exactly once", async () => {
    const result = await recordCustomerPayment(harness.ctx, recordInput());

    expect(result.ok).toBe(true);
    expect(harness.db.ledgerFor(WORKSPACE_ID, CUSTOMER_ID)).toHaveLength(1);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(-500_000);
    expect(harness.db.summaryFor(WORKSPACE_ID, CUSTOMER_ID)?.balance.amountMinor).toBe(-500_000);
  });

  it("records who physically paid when it was not the customer", async () => {
    // CASE-PAYMENT-004 — the debt still belongs to the customer.
    const result = await recordCustomerPayment(
      harness.ctx,
      recordInput({
        payload: { ...recordInput().payload, payerName: "Tài xế anh Hùng" },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.payerName).toBe("Tài xế anh Hùng");
    expect(result.value.customerId).toBe(CUSTOMER_ID);
  });

  it("keeps the summary equal to the sum of entries after every write", async () => {
    await recordCustomerPayment(harness.ctx, recordInput());
    await recordCustomerPayment(
      harness.ctx,
      recordInput({
        commandId: THIRD_COMMAND_ID,
        idempotencyKey: "fixture-idempotency-key-0003",
        payload: {
          ...recordInput().payload,
          paymentId: "00000000-0000-4000-8000-000000000199",
          amount: vnd(100_000),
        },
      }),
    );

    const summary = harness.db.summaryFor(WORKSPACE_ID, CUSTOMER_ID);
    expect(summary?.balance.amountMinor).toBe(ledgerBalance(harness, CUSTOMER_ID));
    expect(summary?.entryCount).toBe(2);
  });
});

describe("BR-COMMAND-001 / TC-PAYMENT-002", () => {
  it("returns the original result when the same payment command is retried", async () => {
    // CASE-PAYMENT-006 and CASE-PAYMENT-007 — double tap, or a lost response.
    const first = await recordCustomerPayment(harness.ctx, recordInput());
    const retry = await recordCustomerPayment(harness.ctx, recordInput());

    expect(first.ok && retry.ok).toBe(true);
    if (!first.ok || !retry.ok) return;
    expect(retry.value).toEqual(first.value);
  });

  it("creates exactly one payment and one ledger entry across both attempts", async () => {
    await recordCustomerPayment(harness.ctx, recordInput());
    await recordCustomerPayment(harness.ctx, recordInput());

    expect(harness.db.payments()).toHaveLength(1);
    expect(harness.db.ledgerFor(WORKSPACE_ID, CUSTOMER_ID)).toHaveLength(1);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(-500_000);
  });
});

describe("BR-PAYMENT-005 / TC-PAYMENT-004", () => {
  it("creates a compensating ledger effect that restores the debt", async () => {
    // CASE-PAYMENT-009.
    await recordCustomerPayment(harness.ctx, recordInput());
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(-500_000);

    const reversed = await reverseCustomerPayment(harness.ctx, reverseInput());

    expect(reversed.ok).toBe(true);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(0);
    expect(harness.db.ledgerFor(WORKSPACE_ID, CUSTOMER_ID)).toHaveLength(2);
  });

  it("preserves the original payment and its entry rather than removing them", async () => {
    await recordCustomerPayment(harness.ctx, recordInput());
    await reverseCustomerPayment(harness.ctx, reverseInput());

    const entries = harness.db.ledgerFor(WORKSPACE_ID, CUSTOMER_ID);
    const original = entries.find((entry) => entry.sourceType === "payment");
    const compensating = entries.find((entry) => entry.sourceType === "payment_reversal");

    expect(original?.amount.amountMinor).toBe(-500_000);
    expect(compensating?.amount.amountMinor).toBe(500_000);
    expect(compensating?.reversalOfEntryId).toBe(original?.id);
    // One payment row, one reversal row — never two payments (BR-PAYMENT-005).
    expect(harness.db.payments()).toHaveLength(1);
    expect(harness.db.reversals()).toHaveLength(1);
  });

  it("marks the payment reversed without touching its amount", async () => {
    await recordCustomerPayment(harness.ctx, recordInput());
    const result = await reverseCustomerPayment(harness.ctx, reverseInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("reversed");
    expect(result.value.amount.amountMinor).toBe(500_000);
    expect(result.value.reversedAmount.amountMinor).toBe(500_000);
    expect(result.value.remainingReversibleAmount.amountMinor).toBe(0);
  });
});

describe("BR-COMMAND-001 / TC-PAYMENT-005", () => {
  it("does not create a second compensating effect when the reversal is retried", async () => {
    // CASE-PAYMENT-011 — a replay, not a second reversal, so no
    // PAYMENT_ALREADY_REVERSED either.
    await recordCustomerPayment(harness.ctx, recordInput());

    const first = await reverseCustomerPayment(harness.ctx, reverseInput());
    const retry = await reverseCustomerPayment(harness.ctx, reverseInput());

    expect(first.ok).toBe(true);
    expect(retry.ok).toBe(true);
    if (!first.ok || !retry.ok) return;

    expect(retry.value).toEqual(first.value);
    expect(harness.db.reversals()).toHaveLength(1);
    expect(harness.db.ledgerFor(WORKSPACE_ID, CUSTOMER_ID)).toHaveLength(2);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(0);
  });
});

describe("BR-PAYMENT-007 / TC-PAYMENT-006", () => {
  it("rejects a reversal carrying a stale payment version", async () => {
    await recordCustomerPayment(harness.ctx, recordInput());
    // First reversal takes the payment to version 2.
    await reverseCustomerPayment(
      harness.ctx,
      reverseInput({ payload: { ...reverseInput().payload, amount: vnd(200_000) } }),
    );

    const stale = await reverseCustomerPayment(
      harness.ctx,
      reverseInput({
        commandId: THIRD_COMMAND_ID,
        idempotencyKey: "fixture-idempotency-key-0004",
        expectedVersion: 1,
        payload: {
          ...reverseInput().payload,
          reversalId: "00000000-0000-4000-8000-000000000299",
          amount: vnd(100_000),
        },
      }),
    );

    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error.code).toBe("PAYMENT_VERSION_CONFLICT");
    // The rejected attempt left the ledger exactly as the first reversal did.
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(-300_000);
  });
});

describe("BR-PAYMENT-003 / TC-PAYMENT-007", () => {
  it("refuses a reversal beyond the remaining reversible amount, writing nothing", async () => {
    // CASE-PAYMENT-010: 500 000 in, 200 000 reversed, 300 000 remains.
    await recordCustomerPayment(harness.ctx, recordInput());
    await reverseCustomerPayment(
      harness.ctx,
      reverseInput({ payload: { ...reverseInput().payload, amount: vnd(200_000) } }),
    );

    const tooMuch = await reverseCustomerPayment(
      harness.ctx,
      reverseInput({
        commandId: THIRD_COMMAND_ID,
        idempotencyKey: "fixture-idempotency-key-0005",
        expectedVersion: 2,
        payload: {
          ...reverseInput().payload,
          reversalId: "00000000-0000-4000-8000-000000000298",
          amount: vnd(300_001),
        },
      }),
    );

    expect(tooMuch.ok).toBe(false);
    if (tooMuch.ok) return;
    expect(tooMuch.error.code).toBe("PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT");
    expect(harness.db.reversals()).toHaveLength(1);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(-300_000);
  });
});
