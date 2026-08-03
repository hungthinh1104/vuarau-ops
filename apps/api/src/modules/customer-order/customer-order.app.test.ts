import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  COMMAND_ID,
  CUSTOMER_ID,
  FOREIGN_ACTOR_ID,
  IDEMPOTENCY_KEY,
  OTHER_IDEMPOTENCY_KEY,
  PRODUCT_CA_CHUA_ID,
  SECOND_COMMAND_ID,
  TRANSACTION_TIME,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import { customerOrderIdSchema } from "@vuarau/domain-contracts";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import {
  cancelCustomerOrder,
  confirmCustomerOrder,
  createCustomerOrderDraft,
  updateCustomerOrderDraft,
} from "./customer-order.handlers.ts";
import { getCustomerOrder, listCustomerOrders } from "./customer-order.queries.ts";

let harness: Harness;
const ORDER_ID = customerOrderIdSchema.parse("44444444-4444-4444-8444-444444444444");
const LINE_ID = "55555555-5555-4555-8555-555555555555";

beforeEach(() => {
  harness = createHarness();
});

const createInput = (overrides: Record<string, unknown> = {}) => ({
  commandId: COMMAND_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: TRANSACTION_TIME,
  payload: {
    customerOrderId: ORDER_ID,
    customerId: CUSTOMER_ID,
    channel: "account_customer",
    currency: "VND",
    lines: [
      {
        lineId: LINE_ID,
        productId: PRODUCT_CA_CHUA_ID,
        productName: "Cà chua",
        quantity: { valueScaled: 12_500, unit: "kg" },
        agreedUnitPrice: { amountMinor: 18_000, currency: "VND" },
      },
    ],
    note: null,
    paymentTermsSnapshot: { label: "Net 7", dueAt: "2026-01-08T05:00:00.000Z" },
    evidenceReferences: [],
    replacesCustomerOrderId: null,
    ...overrides,
  },
});

const commandInput = (
  payload: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) => ({
  commandId: SECOND_COMMAND_ID,
  idempotencyKey: OTHER_IDEMPOTENCY_KEY,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: TRANSACTION_TIME,
  ...overrides,
  payload,
});

describe("BR-CUSTOMER-ORDER-005 / TC-CUSTOMER-ORDER-004", () => {
  it("replays a draft create without inserting a second commercial fact", async () => {
    const first = await createCustomerOrderDraft(harness.ctx, createInput());
    const retry = await createCustomerOrderDraft(harness.ctx, createInput());

    expect(first.ok).toBe(true);
    expect(retry).toEqual(first);
    expect(
      harness.db
        .auditRecords()
        .filter((record) => record.action === "customer_order.draft_created"),
    ).toHaveLength(1);
    expect(harness.db.accountEntries()).toHaveLength(0);
  });

  it("confirms once, preserves snapshots and leaves financial truth untouched", async () => {
    await createCustomerOrderDraft(harness.ctx, createInput());
    const input = commandInput({ customerOrderId: ORDER_ID }, { expectedVersion: 1 });
    const first = await confirmCustomerOrder(harness.ctx, input);
    const retry = await confirmCustomerOrder(harness.ctx, input);

    expect(first.ok).toBe(true);
    expect(retry).toEqual(first);
    if (!first.ok) return;
    expect(first.value.status).toBe("confirmed");
    expect(first.value.totalAmount).toEqual({ amountMinor: 225_000, currency: "VND" });
    expect(first.value.paymentTermsSnapshot?.label).toBe("Net 7");
    expect(harness.db.accountEntries()).toHaveLength(0);
    expect(
      harness.db.auditRecords().filter((record) => record.action === "customer_order.confirmed"),
    ).toHaveLength(1);
  });
});

describe("BR-CUSTOMER-ORDER-003 / TC-CUSTOMER-ORDER-005", () => {
  it("refuses a stale edit and preserves the stored version", async () => {
    await createCustomerOrderDraft(harness.ctx, createInput());
    const result = await updateCustomerOrderDraft(
      harness.ctx,
      commandInput(createInput().payload, {
        expectedVersion: 0,
        payload: { ...createInput().payload, customerOrderId: ORDER_ID },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CUSTOMER_ORDER_VERSION_CONFLICT");
    const read = await getCustomerOrder(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerOrderId: ORDER_ID,
    });
    expect(read.ok && read.value?.version).toBe(1);
  });

  it("enforces workspace authorization before any order write", async () => {
    const result = await createCustomerOrderDraft(harness.contextFor(FOREIGN_ACTOR_ID), {
      ...createInput(),
      actorId: FOREIGN_ACTOR_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("WORKSPACE_ACCESS_DENIED");
    expect(harness.db.auditRecords()).toHaveLength(0);
  });

  it("cancels with a reason and exposes the result through a scoped list", async () => {
    await createCustomerOrderDraft(harness.ctx, createInput());
    const cancelled = await cancelCustomerOrder(
      harness.ctx,
      commandInput(
        { customerOrderId: ORDER_ID, reason: "Khách đổi lịch nhận" },
        { expectedVersion: 1 },
      ),
    );
    expect(cancelled.ok).toBe(true);
    const listed = await listCustomerOrders(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: null,
      status: "cancelled",
      cursor: null,
      limit: 20,
    });
    expect(listed.ok && listed.value.items[0]?.status).toBe("cancelled");
    expect(cancelled.ok && cancelled.value.cancellationReason).toBe("Khách đổi lịch nhận");
  });
});
