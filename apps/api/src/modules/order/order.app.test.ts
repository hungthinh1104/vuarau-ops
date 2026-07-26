import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  COMMAND_ID,
  CUSTOMER_ID,
  IDEMPOTENCY_KEY,
  ORDER_ID,
  OTHER_IDEMPOTENCY_KEY,
  RECORDED_AT,
  FOREIGN_ACTOR_ID,
  SECOND_COMMAND_ID,
  TRANSACTION_TIME,
  WORKSPACE_ID,
  orderLineInputs,
  validDraftOrder,
} from "@vuarau/test-fixtures";
import { createHarness, ledgerBalance, type Harness } from "../../testing/command-test-harness.ts";
import { createOrder } from "./create-order.handler.ts";
import { confirmOrder } from "./confirm-order.handler.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

const createInput = (idempotencyKey: string = IDEMPOTENCY_KEY) => ({
  commandId: COMMAND_ID,
  idempotencyKey,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: TRANSACTION_TIME,
  payload: {
    orderId: ORDER_ID,
    customerId: CUSTOMER_ID,
    currency: "VND",
    lines: [...orderLineInputs],
    note: null,
  },
});

const confirmInput = (overrides: Record<string, unknown> = {}) => ({
  commandId: SECOND_COMMAND_ID,
  idempotencyKey: OTHER_IDEMPOTENCY_KEY,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: TRANSACTION_TIME,
  expectedVersion: 1,
  payload: { orderId: ORDER_ID },
  ...overrides,
});

describe("BR-COMMAND-001 / TC-ORDER-004", () => {
  it("does not duplicate debt when the same confirm command is retried", async () => {
    // CASE-ORDER-005: the response was lost, the client retried with the same key.
    await createOrder(harness.ctx, createInput());

    const first = await confirmOrder(harness.ctx, confirmInput());
    const retry = await confirmOrder(harness.ctx, confirmInput());

    expect(first.ok).toBe(true);
    expect(retry.ok).toBe(true);

    expect(harness.db.ledgerFor(WORKSPACE_ID, CUSTOMER_ID)).toHaveLength(1);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(875_000);
  });

  it("returns the original result to the retry, not an error", async () => {
    await createOrder(harness.ctx, createInput());

    const first = await confirmOrder(harness.ctx, confirmInput());
    // A retry carries a new commandId — the key is what dedupes.
    const retry = await confirmOrder(harness.ctx, confirmInput({ commandId: COMMAND_ID }));

    expect(first.ok && retry.ok).toBe(true);
    if (!first.ok || !retry.ok) return;
    expect(retry.value).toEqual(first.value);
    expect(retry.value.status).toBe("confirmed");
  });

  it("writes exactly one audit record for the confirmation", async () => {
    await createOrder(harness.ctx, createInput());
    await confirmOrder(harness.ctx, confirmInput());
    await confirmOrder(harness.ctx, confirmInput());

    const confirmations = harness.db
      .auditRecords()
      .filter((record) => record.action === "order.confirmed");
    expect(confirmations).toHaveLength(1);
  });
});

describe("BR-ORDER-006 / TC-ORDER-005", () => {
  it("rejects a confirmation carrying a stale aggregate version", async () => {
    // CASE-ORDER-004: the order is at version 2, the phone still believes 1.
    harness.db.seedOrder({ ...validDraftOrder, version: 2 });

    const result = await confirmOrder(harness.ctx, confirmInput({ expectedVersion: 1 }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ORDER_VERSION_CONFLICT");
    expect(result.error.details).toMatchObject({ expectedVersion: 1, actualVersion: 2 });
  });

  it("leaves no ledger entry and no version change behind when it rejects", async () => {
    harness.db.seedOrder({ ...validDraftOrder, version: 2 });
    await confirmOrder(harness.ctx, confirmInput({ expectedVersion: 1 }));

    expect(harness.db.ledgerEntries()).toHaveLength(0);
    expect(harness.db.summaryFor(WORKSPACE_ID, CUSTOMER_ID)).toBeNull();
  });

  it("lets the caller succeed once it re-reads and sends the current version", async () => {
    harness.db.seedOrder({ ...validDraftOrder, version: 2 });

    const conflict = await confirmOrder(harness.ctx, confirmInput({ expectedVersion: 1 }));
    expect(conflict.ok).toBe(false);

    // A refused command does not consume its idempotency key.
    const retried = await confirmOrder(harness.ctx, confirmInput({ expectedVersion: 2 }));
    expect(retried.ok).toBe(true);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(875_000);
  });
});

describe("BR-COMMAND-003 / TC-ORDER-011", () => {
  it("keeps the business time and the recording time apart", async () => {
    // CASE-ORDER-006: sold at 05:00, entered days later.
    await createOrder(harness.ctx, createInput());
    harness.clock.set(RECORDED_AT);
    await confirmOrder(harness.ctx, confirmInput());

    const entry = harness.db.ledgerFor(WORKSPACE_ID, CUSTOMER_ID)[0]!;
    expect(entry.transactionTime).toBe(TRANSACTION_TIME);
    expect(entry.recordedAt).toBe(RECORDED_AT);
  });

  it("ages the summary from the transaction time, not the recording time", async () => {
    await createOrder(harness.ctx, createInput());
    await confirmOrder(harness.ctx, confirmInput());

    const summary = harness.db.summaryFor(WORKSPACE_ID, CUSTOMER_ID);
    expect(summary?.lastEntryTransactionTime).toBe(TRANSACTION_TIME);
  });
});

describe("BR-ORDER-007 / TC-ORDER-003", () => {
  it("moves the customer's balance by exactly the order total, once", async () => {
    await createOrder(harness.ctx, createInput());
    await confirmOrder(harness.ctx, confirmInput());

    const summary = harness.db.summaryFor(WORKSPACE_ID, CUSTOMER_ID);
    expect(summary?.balance.amountMinor).toBe(875_000);
    expect(summary?.entryCount).toBe(1);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(summary?.balance.amountMinor);
  });

  it("creates a draft without moving any money", async () => {
    await createOrder(harness.ctx, createInput());

    expect(harness.db.ledgerEntries()).toHaveLength(0);
    expect(harness.db.summaryFor(WORKSPACE_ID, CUSTOMER_ID)).toBeNull();
  });
});

describe("BR-CUSTOMER-002 / TC-CUSTOMER-002", () => {
  it("refuses a command from an actor who is not a member of the workspace", async () => {
    // A genuine identity — an owner, but of a *different* depot. Knowing this
    // workspace's id is not access to it.
    const result = await createOrder(harness.contextFor(FOREIGN_ACTOR_ID), {
      ...createInput(),
      actorId: FOREIGN_ACTOR_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("WORKSPACE_ACCESS_DENIED");
    expect(harness.db.ledgerEntries()).toHaveLength(0);
  });

  it("refuses before the impersonation check can be dodged by naming yourself", async () => {
    // The foreigner names themselves honestly; membership still stops them.
    const result = await createOrder(harness.contextFor(FOREIGN_ACTOR_ID), {
      ...createInput(),
      actorId: FOREIGN_ACTOR_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("WORKSPACE_ACCESS_DENIED");
  });

  it("cannot reach a customer that lives in another workspace", async () => {
    const result = await createOrder(harness.ctx, {
      ...createInput(),
      payload: { ...createInput().payload, customerId: "00000000-0000-4000-8000-0000000000c9" },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CUSTOMER_NOT_FOUND");
  });
});
