import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  CUSTOMER_ID,
  OTHER_WORKSPACE_ID,
  WORKSPACE_ID,
  LATER_TRANSACTION_TIME,
  vnd,
} from "@vuarau/test-fixtures";
import { createHarness, ledgerBalance, type Harness } from "../../testing/command-test-harness.ts";
import { recordCustomerPayment } from "../payment/record-payment.handler.ts";

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

describe("model-based application invariants", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it("TC-PROPERTY-IDEMPOTENCY-001 records one ledger effect for every unique command in a generated sequence", async () => {
    const amounts = Array.from({ length: 24 }, (_, index) => 10_000 + ((index * 7_919) % 90_000));
    let modelBalance = 0;

    for (const [index, amount] of amounts.entries()) {
      const input = {
        commandId: id(1_000 + index),
        idempotencyKey: `property-payment-${index}`,
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        occurredAt: LATER_TRANSACTION_TIME,
        payload: {
          paymentId: id(1_100 + index),
          customerId: CUSTOMER_ID,
          amount: vnd(amount),
          method: "cash" as const,
          payerName: null,
          note: null,
        },
      };
      const first = await recordCustomerPayment(harness.ctx, input);
      const retry = await recordCustomerPayment(harness.ctx, input);
      expect(first.ok).toBe(true);
      expect(retry.ok).toBe(true);
      modelBalance -= amount;
      expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(modelBalance);
      expect(harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID)).toHaveLength(index + 1);
    }
  });

  it("TC-PROPERTY-WORKSPACE-001 never resolves a customer through a foreign workspace id", async () => {
    const result = await harness.db
      .unitOfWork()
      .transaction((repositories) =>
        repositories.customerReads.get(OTHER_WORKSPACE_ID, CUSTOMER_ID),
      );
    expect(result).toBeNull();
    expect(
      await harness.db
        .unitOfWork()
        .transaction((repositories) => repositories.customerReads.get(WORKSPACE_ID, CUSTOMER_ID)),
    ).not.toBeNull();
  });
});
