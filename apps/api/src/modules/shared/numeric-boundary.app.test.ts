import { describe, expect, it } from "vitest";
import { PersistedNumberOutOfRangeError } from "@vuarau/db";
import {
  COMMAND_ID,
  CUSTOMER_ID,
  IDEMPOTENCY_KEY,
  LATER_TRANSACTION_TIME,
  PAYMENT_AMOUNT,
  PAYMENT_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import type { Repositories, UnitOfWork } from "../../infrastructure/persistence/ports.ts";
import { withRequestId } from "../../infrastructure/logging.ts";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { recordCustomerPayment } from "../payment/record-payment.handler.ts";
import { runQuery } from "./read-pipeline.ts";

function throwsPersistedRangeAfterSuccess(harness: Harness): UnitOfWork {
  return {
    transaction: async <T>(work: (repos: Repositories) => Promise<T>): Promise<T> =>
      harness.deps.uow.transaction(async (repos) => {
        const result = await work(repos);
        if (
          typeof result === "object" &&
          result !== null &&
          "ok" in result &&
          (result as { readonly ok?: unknown }).ok === true
        ) {
          throw new PersistedNumberOutOfRangeError("customer_account_entries.amount_minor");
        }
        return result;
      }),
  };
}

describe("BR-OPS-009 / TC-OPS-019 — PERSISTED_NUMBER_OUT_OF_RANGE pipeline boundary", () => {
  it("rolls back command effects and returns a non-retryable diagnostic", async () => {
    const harness = createHarness();
    const ctx = {
      ...harness.ctx,
      deps: { ...harness.deps, uow: throwsPersistedRangeAfterSuccess(harness) },
    };

    const result = await withRequestId("req-safe-range", () =>
      recordCustomerPayment(ctx, {
        commandId: COMMAND_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        workspaceId: WORKSPACE_ID,
        actorId: ctx.principal.actorId,
        occurredAt: LATER_TRANSACTION_TIME,
        payload: {
          paymentId: PAYMENT_ID,
          customerId: CUSTOMER_ID,
          amount: PAYMENT_AMOUNT,
          method: "cash",
          payerName: null,
          note: null,
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: "PERSISTED_NUMBER_OUT_OF_RANGE",
      retryable: false,
      details: {
        field: "customer_account_entries.amount_minor",
        requestId: "req-safe-range",
      },
    });
    expect(JSON.stringify(result.error)).not.toContain("9007199254740992");
    expect(harness.db.payments()).toHaveLength(0);
    expect(harness.db.accountEntries()).toHaveLength(0);
    expect(harness.db.auditRecords()).toHaveLength(0);
  });

  it("maps the same failure for reads without exposing the database value", async () => {
    const harness = createHarness();
    const ctx = {
      ...harness.ctx,
      deps: { ...harness.deps, uow: throwsPersistedRangeAfterSuccess(harness) },
    };

    const result = await withRequestId("req-safe-read", () =>
      runQuery({
        ctx,
        workspaceId: WORKSPACE_ID,
        permission: "report.read",
        execute: async () => ({ balanceMinor: 9007199254740992 }),
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "PERSISTED_NUMBER_OUT_OF_RANGE",
        message: "Persisted numeric data is outside the supported range.",
        details: { field: "customer_account_entries.amount_minor", requestId: "req-safe-read" },
        retryable: false,
      },
    });
  });
});
