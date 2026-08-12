import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
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
import { defaultWorkspaceOperationalProfile } from "@vuarau/domain-contracts";
import { createHarness, ledgerBalance, type Harness } from "../../testing/command-test-harness.ts";
import { recordCustomerPayment } from "../payment/record-payment.handler.ts";
import { runCommand } from "./command-pipeline.ts";
import { CommandIntegrityError } from "./integrity.ts";
import { withRequestId } from "../../infrastructure/logging.ts";
import { defineCommand } from "@vuarau/domain-contracts";
import { ok } from "@vuarau/domain-kernel";

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
    expect(harness.db.accountEntries()).toHaveLength(1);
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

  it("accepts a replay whose JSON field sale differs", async () => {
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

describe("BR-COMMAND-001 / command type binding", () => {
  it("does not replay a receipt under a different command type", async () => {
    const schema = defineCommand(z.object({ value: z.string() }));
    const input = {
      commandId: COMMAND_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      occurredAt: LATER_TRANSACTION_TIME,
      payload: { value: "same canonical payload" },
    };
    const first = await runCommand({
      commandType: "SyntheticCommandA",
      schema,
      input,
      ctx: harness.ctx,
      requiredPermission: "customer.read",
      resultSchema: z.object({ accepted: z.boolean() }),
      execute: async () => ok({ accepted: true }),
    });
    const secondExecution = vi.fn(async () => ok({ accepted: false }));
    const second = await runCommand({
      commandType: "SyntheticCommandB",
      schema,
      input,
      ctx: harness.ctx,
      requiredPermission: "customer.read",
      resultSchema: z.object({ accepted: z.boolean() }),
      execute: secondExecution,
    });

    expect(first.ok).toBe(true);
    expect(second).toMatchObject({
      ok: false,
      error: { code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_COMMAND" },
    });
    expect(secondExecution).not.toHaveBeenCalled();
  });

  it("replays a completed receipt before a workflow gate changes", async () => {
    const schema = defineCommand(z.object({ value: z.string() }));
    const input = {
      commandId: COMMAND_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      occurredAt: LATER_TRANSACTION_TIME,
      payload: { value: "replay-before-gates" },
    };
    const execute = vi.fn(async () => ok({ accepted: true }));
    const first = await runCommand({
      commandType: "SyntheticWorkflowCommand",
      schema,
      input,
      ctx: harness.ctx,
      requiredPermission: "customer.read",
      requiredWorkflows: ["purchasing"],
      resultSchema: z.object({ accepted: z.boolean() }),
      execute,
    });

    harness.db.setOperationalProfile({
      ...defaultWorkspaceOperationalProfile(WORKSPACE_ID),
      purchasingMode: "disabled",
      inventoryMode: "disabled",
      qualityGradeMode: "disabled",
      deliveryMode: "disabled",
      version: 2,
    });
    const replay = await runCommand({
      commandType: "SyntheticWorkflowCommand",
      schema,
      input: { ...input, commandId: SECOND_COMMAND_ID },
      ctx: harness.ctx,
      requiredPermission: "customer.read",
      requiredWorkflows: ["purchasing"],
      resultSchema: z.object({ accepted: z.boolean() }),
      execute,
    });

    expect(first).toEqual({ ok: true, value: { accepted: true } });
    expect(replay).toEqual(first);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects a completed receipt whose result no longer matches its response schema", async () => {
    const schema = defineCommand(z.object({ value: z.string() }));
    const resultSchema = z.object({ accepted: z.boolean() });
    const input = {
      commandId: COMMAND_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      occurredAt: LATER_TRANSACTION_TIME,
      payload: { value: "stored-result-contract" },
    };
    const first = await runCommand({
      commandType: "SyntheticCommandA",
      schema,
      input,
      ctx: harness.ctx,
      requiredPermission: "customer.read",
      resultSchema,
      execute: async () => ok({ accepted: true }),
    });
    const receipt = harness.db.receipts()[0]!;
    harness.db.replaceReceipt({ ...receipt, result: { accepted: "not-a-boolean" } });
    const replay = await runCommand({
      commandType: "SyntheticCommandA",
      schema,
      input: { ...input, commandId: SECOND_COMMAND_ID },
      ctx: harness.ctx,
      requiredPermission: "customer.read",
      resultSchema,
      execute: async () => ok({ accepted: false }),
    });

    expect(first.ok).toBe(true);
    expect(replay).toMatchObject({
      ok: false,
      error: { code: "COMMAND_RECEIPT_RESULT_INVALID" },
    });
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

    const entry = harness.db.accountEntries()[0]!;
    expect(entry.transactionTime).toBe(LATER_TRANSACTION_TIME);
    expect(entry.recordedAt).toBe(LATEST_RECORDED_AT);
  });

  it("gives every row a command writes the same recorded instant", async () => {
    await recordCustomerPayment(harness.ctx, paymentInput());

    const entry = harness.db.accountEntries()[0]!;
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
    expect(harness.db.accountEntries()).toHaveLength(0);
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
  it("converts persisted integrity failures into a controlled rejection", async () => {
    const schema = defineCommand(z.object({ value: z.string() }));
    const result = await withRequestId("req-command-integrity", () =>
      runCommand({
        commandType: "SyntheticIntegrityCommand",
        schema,
        input: {
          commandId: COMMAND_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
          workspaceId: WORKSPACE_ID,
          actorId: ACTOR_ID,
          occurredAt: LATER_TRANSACTION_TIME,
          payload: { value: "corrupt-source" },
        },
        ctx: harness.ctx,
        requiredPermission: "customer.read",
        resultSchema: z.object({ accepted: z.boolean() }),
        execute: async () => {
          throw new CommandIntegrityError(
            "ACCOUNT_RECONCILIATION_INTEGRITY_FAILURE",
            "test-only persisted source diagnostic",
          );
        },
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "ACCOUNT_RECONCILIATION_INTEGRITY_FAILURE",
        details: { requestId: "req-command-integrity" },
      },
    });
    expect(harness.db.receipts()).toHaveLength(0);
  });

  it("leaves no partial effect when a command is refused", async () => {
    const result = await recordCustomerPayment(
      harness.ctx,
      paymentInput({ payload: { ...paymentInput().payload, amount: vnd(0) } }),
    );

    expect(result.ok).toBe(false);
    expect(harness.db.payments()).toHaveLength(0);
    expect(harness.db.accountEntries()).toHaveLength(0);
    expect(harness.db.auditRecords()).toHaveLength(0);
    expect(harness.db.balanceFor(WORKSPACE_ID, CUSTOMER_ID)).toBeNull();
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

  it("TC-PAYMENT-012 — refuses a payment identity reused by a different command", async () => {
    await recordCustomerPayment(harness.ctx, paymentInput());

    const result = await recordCustomerPayment(
      harness.ctx,
      paymentInput({ commandId: SECOND_COMMAND_ID, idempotencyKey: OTHER_IDEMPOTENCY_KEY }),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "PAYMENT_ALREADY_EXISTS", retryable: false },
    });

    // Exactly the state after the first payment — nothing half-applied.
    expect(harness.db.payments()).toHaveLength(1);
    expect(harness.db.accountEntries()).toHaveLength(1);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(-500_000);
    expect(harness.db.balanceFor(WORKSPACE_ID, CUSTOMER_ID)?.entryCount).toBe(1);
  });
});

describe("M23 pilot scope gate", () => {
  it("stops an excluded command before claiming idempotency or writing an effect", async () => {
    const pilotContext = {
      ...harness.ctx,
      deps: {
        ...harness.deps,
        pilotScope: {
          isCommandExcluded: (commandType: string) => commandType === "RecordCustomerPayment",
        },
      },
    };

    const result = await recordCustomerPayment(pilotContext, paymentInput());

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "PILOT_SCOPE_EXCLUDED",
        details: { commandType: "RecordCustomerPayment" },
      },
    });
    expect(harness.db.payments()).toHaveLength(0);
    expect(harness.db.accountEntries()).toHaveLength(0);
    expect(harness.db.auditRecords()).toHaveLength(0);
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
