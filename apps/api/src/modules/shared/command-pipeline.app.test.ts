import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  COMMAND_ID,
  CUSTOMER_ID,
  FUTURE_TRANSACTION_TIME,
  IDEMPOTENCY_KEY,
  LATER_TRANSACTION_TIME,
  LATEST_RECORDED_AT,
  OTHER_IDEMPOTENCY_KEY,
  PAYMENT_AMOUNT,
  PAYMENT_ID,
  SECOND_COMMAND_ID,
  WORKSPACE_ID,
  vnd,
} from "@vuarau/test-fixtures";
import { createHarness, ledgerBalance, type Harness } from "../../testing/command-test-harness.ts";
import { recordCustomerPayment } from "../payment/record-payment.handler.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

const paymentInput = (overrides: Record<string, unknown> = {}) => ({
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

describe("BR-COMMAND-001 / TC-COMMAND-001", () => {
  it("replays the stored result without writing anything a second time", async () => {
    const first = await recordCustomerPayment(harness.ctx, paymentInput());
    const replay = await recordCustomerPayment(
      harness.ctx,
      // A retry: new command id, same key. The key is what dedupes (ADR-0008).
      paymentInput({ commandId: SECOND_COMMAND_ID }),
    );

    expect(first.ok && replay.ok).toBe(true);
    if (!first.ok || !replay.ok) return;

    expect(replay.value).toEqual(first.value);
    expect(harness.db.payments()).toHaveLength(1);
    expect(harness.db.ledgerEntries()).toHaveLength(1);
    expect(harness.db.auditRecords()).toHaveLength(1);
  });

  it("treats a different idempotency key as a genuinely different command", async () => {
    await recordCustomerPayment(harness.ctx, paymentInput());
    await recordCustomerPayment(
      harness.ctx,
      paymentInput({
        commandId: SECOND_COMMAND_ID,
        idempotencyKey: OTHER_IDEMPOTENCY_KEY,
        payload: {
          ...paymentInput().payload,
          paymentId: "00000000-0000-4000-8000-000000000198",
          amount: vnd(100_000),
        },
      }),
    );

    // CASE-PAYMENT-001: two genuine cash payments a minute apart must both land.
    expect(harness.db.payments()).toHaveLength(2);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(-600_000);
  });
});

describe("BR-COMMAND-002 / TC-COMMAND-002", () => {
  it("rejects an idempotency key reused with a different payload", async () => {
    await recordCustomerPayment(harness.ctx, paymentInput());

    const different = await recordCustomerPayment(
      harness.ctx,
      paymentInput({
        commandId: SECOND_COMMAND_ID,
        payload: { ...paymentInput().payload, amount: vnd(999_000) },
      }),
    );

    expect(different.ok).toBe(false);
    if (different.ok) return;
    expect(different.error.code).toBe("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD");
    // Returning the first result would have silently discarded the second command.
    expect(harness.db.payments()).toHaveLength(1);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(-500_000);
  });

  it("accepts a replay whose JSON field order differs", async () => {
    const first = await recordCustomerPayment(harness.ctx, paymentInput());

    const reordered = await recordCustomerPayment(
      harness.ctx,
      paymentInput({
        payload: {
          note: null,
          payerName: null,
          method: "cash",
          amount: PAYMENT_AMOUNT,
          customerId: CUSTOMER_ID,
          paymentId: PAYMENT_ID,
        },
      }),
    );

    expect(first.ok && reordered.ok).toBe(true);
    if (!first.ok || !reordered.ok) return;
    expect(reordered.value).toEqual(first.value);
  });
});

describe("BR-COMMAND-003 / TC-COMMAND-003", () => {
  it("takes the transaction time from the command and the recorded time from the server", async () => {
    // CASE-PAYMENT-008: captured offline at 08:30 on the 22nd, uploaded later.
    const result = await recordCustomerPayment(harness.ctx, paymentInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.transactionTime).toBe(LATER_TRANSACTION_TIME);
    expect(result.value.recordedAt).toBe(LATEST_RECORDED_AT);

    const entry = harness.db.ledgerEntries()[0]!;
    expect(entry.transactionTime).toBe(LATER_TRANSACTION_TIME);
    expect(entry.recordedAt).toBe(LATEST_RECORDED_AT);
  });

  it("gives every row a command writes the same recorded instant", async () => {
    await recordCustomerPayment(harness.ctx, paymentInput());

    const entry = harness.db.ledgerEntries()[0]!;
    const audit = harness.db.auditRecords()[0]!;
    expect(audit.recordedAt).toBe(entry.recordedAt);
  });
});

describe("BR-COMMAND-004 / TC-COMMAND-005", () => {
  it("refuses a transaction time beyond the clock-skew tolerance", async () => {
    const result = await recordCustomerPayment(
      harness.ctx,
      paymentInput({ occurredAt: FUTURE_TRANSACTION_TIME }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("TRANSACTION_TIME_IN_FUTURE");
    expect(harness.db.ledgerEntries()).toHaveLength(0);
  });

  it("accepts a back-dated transaction time — that is normal, not an error", async () => {
    const result = await recordCustomerPayment(
      harness.ctx,
      paymentInput({ occurredAt: "2020-01-01T05:00:00.000+07:00" }),
    );

    expect(result.ok).toBe(true);
  });

  it("tolerates a few minutes of phone clock drift", async () => {
    // 2 minutes ahead of the harness clock: a cheap device, not a fiction.
    const result = await recordCustomerPayment(
      harness.ctx,
      paymentInput({ occurredAt: "2026-07-23T09:02:30.000+07:00" }),
    );

    expect(result.ok).toBe(true);
  });
});

describe("BR-COMMAND-005 / TC-COMMAND-004", () => {
  it("leaves no partial effect when a command is refused", async () => {
    const result = await recordCustomerPayment(
      harness.ctx,
      paymentInput({ payload: { ...paymentInput().payload, amount: vnd(0) } }),
    );

    expect(result.ok).toBe(false);
    expect(harness.db.payments()).toHaveLength(0);
    expect(harness.db.ledgerEntries()).toHaveLength(0);
    expect(harness.db.auditRecords()).toHaveLength(0);
    expect(harness.db.summaryFor(WORKSPACE_ID, CUSTOMER_ID)).toBeNull();
  });

  it("does not consume the idempotency key of a refused command", async () => {
    // The user fixes the amount and submits again with the same key.
    const refused = await recordCustomerPayment(
      harness.ctx,
      paymentInput({ payload: { ...paymentInput().payload, amount: vnd(0) } }),
    );
    expect(refused.ok).toBe(false);

    const corrected = await recordCustomerPayment(harness.ctx, paymentInput());
    expect(corrected.ok).toBe(true);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(-500_000);
  });

  it("rolls back every effect when persistence fails midway", async () => {
    await recordCustomerPayment(harness.ctx, paymentInput());

    // A second payment reusing the same paymentId: the ledger's
    // UNIQUE (source_type, source_id) constraint throws mid-transaction.
    await expect(
      recordCustomerPayment(
        harness.ctx,
        paymentInput({ commandId: SECOND_COMMAND_ID, idempotencyKey: OTHER_IDEMPOTENCY_KEY }),
      ),
    ).rejects.toThrow(/Duplicate ledger entry/);

    // Exactly the state after the first payment — nothing half-applied.
    expect(harness.db.payments()).toHaveLength(1);
    expect(harness.db.ledgerEntries()).toHaveLength(1);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(-500_000);
    expect(harness.db.summaryFor(WORKSPACE_ID, CUSTOMER_ID)?.entryCount).toBe(1);
  });
});

describe("BR-COMMAND-001 / TC-COMMAND-006", () => {
  it("rejects a command id reused under a different idempotency key", async () => {
    await recordCustomerPayment(harness.ctx, paymentInput());

    const reusedId = await recordCustomerPayment(
      harness.ctx,
      paymentInput({
        idempotencyKey: OTHER_IDEMPOTENCY_KEY,
        payload: {
          ...paymentInput().payload,
          paymentId: "00000000-0000-4000-8000-000000000197",
        },
      }),
    );

    expect(reusedId.ok).toBe(false);
    if (reusedId.ok) return;
    expect(reusedId.error.code).toBe("DUPLICATE_COMMAND");
  });
});
