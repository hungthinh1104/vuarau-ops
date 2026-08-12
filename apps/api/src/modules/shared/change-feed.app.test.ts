import { describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  COMMAND_ID,
  CUSTOMER_ID,
  IDEMPOTENCY_KEY,
  LATER_TRANSACTION_TIME,
  PAYMENT_AMOUNT,
  PAYMENT_ID,
  SECOND_COMMAND_ID,
  OTHER_WORKSPACE_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import { createHarness } from "../../testing/command-test-harness.ts";
import { recordCustomerPayment } from "../payment/record-payment.handler.ts";

describe("durable workspace change feed", () => {
  it("allocates one revision and one targeted change for a completed command", async () => {
    const harness = createHarness();
    const input = {
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
    };

    const first = await recordCustomerPayment(harness.ctx, input);
    const replay = await recordCustomerPayment(harness.ctx, {
      ...input,
      commandId: SECOND_COMMAND_ID,
    });
    const page = await harness.deps.uow.transaction((repos) =>
      repos.receipts.changesSince(WORKSPACE_ID, "0", 200),
    );

    expect(first.ok).toBe(true);
    expect(replay).toEqual(first);
    expect(page.changes).toHaveLength(1);
    expect(page.changes[0]).toMatchObject({
      revision: "1",
      commandType: "RecordCustomerPayment",
      topics: expect.arrayContaining(["payment", "account", "dashboard"]),
    });
    expect(page.nextRevision).toBe("1");
    expect(harness.db.receipts()[0]?.revision).toBe("1");
  });

  it("keeps workspace cursors isolated", async () => {
    const harness = createHarness();
    const page = await harness.deps.uow.transaction((repos) =>
      repos.receipts.changesSince(OTHER_WORKSPACE_ID, "0", 200),
    );
    expect(page).toEqual({ changes: [], nextRevision: "0" });
  });
});
