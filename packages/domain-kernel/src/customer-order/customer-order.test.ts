import { describe, expect, it } from "vitest";
import type {
  CancelCustomerOrderCommand,
  ConfirmCustomerOrderCommand,
  CreateCustomerOrderDraftCommand,
  UpdateCustomerOrderDraftCommand,
} from "@vuarau/domain-contracts";
import { customerOrderIdSchema, customerOrderLineIdSchema } from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  COMMAND_ID,
  CUSTOMER_ID,
  IDEMPOTENCY_KEY,
  PRODUCT_CA_CHUA_ID,
  RECORDED_AT,
  TRANSACTION_TIME,
  WORKSPACE_ID,
  vnd,
} from "@vuarau/test-fixtures";
import {
  decideCancelCustomerOrder,
  decideConfirmCustomerOrder,
  decideCreateCustomerOrderDraft,
  decideUpdateCustomerOrderDraft,
} from "./index.ts";

const ORDER_ID = customerOrderIdSchema.parse("44444444-4444-4444-8444-444444444444");
const LINE_ID = customerOrderLineIdSchema.parse("55555555-5555-4555-8555-555555555555");

const baseLine = {
  lineId: LINE_ID,
  productId: PRODUCT_CA_CHUA_ID,
  productName: "Cà chua",
  quantity: { valueScaled: 12_500, unit: "kg" as const },
  agreedUnitPrice: vnd(18_000),
};

function createCommand(
  overrides: Partial<CreateCustomerOrderDraftCommand["payload"]> = {},
): CreateCustomerOrderDraftCommand {
  return {
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
      lines: [baseLine],
      note: null,
      paymentTermsSnapshot: { label: "Net 7", dueAt: "2026-01-08T05:00:00.000Z" },
      evidenceReferences: [],
      replacesCustomerOrderId: null,
      ...overrides,
    },
  };
}

function confirmCommand(expectedVersion: number): ConfirmCustomerOrderCommand {
  return {
    commandId: COMMAND_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: TRANSACTION_TIME,
    expectedVersion,
    payload: { customerOrderId: ORDER_ID },
  };
}

describe("BR-CUSTOMER-ORDER-001 / TC-CUSTOMER-ORDER-001", () => {
  it("keeps an unpriced draft commercial-only", () => {
    const result = decideCreateCustomerOrderDraft(
      createCommand({ lines: [{ ...baseLine, agreedUnitPrice: null }] }),
      RECORDED_AT,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aggregate.status).toBe("draft");
    expect(result.value.aggregate.totalAmount).toBeNull();
    expect(result.value.accountEntries).toEqual([]);
    expect(result.value.aggregate.paymentTermsSnapshot).toEqual({
      label: "Net 7",
      dueAt: "2026-01-08T05:00:00.000Z",
    });
  });

  it("does not represent a walk-in with a fake customer", () => {
    const result = decideCreateCustomerOrderDraft(
      createCommand({ channel: "walk_in", customerId: CUSTOMER_ID }),
      RECORDED_AT,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CUSTOMER_ORDER_CUSTOMER_NOT_ALLOWED");
  });
});

describe("BR-CUSTOMER-ORDER-002 / TC-CUSTOMER-ORDER-002", () => {
  it("requires canonical product and agreed price before confirmation", () => {
    const draft = decideCreateCustomerOrderDraft(
      createCommand({
        lines: [{ ...baseLine, productId: null, agreedUnitPrice: null }],
      }),
      RECORDED_AT,
    );
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    const result = decideConfirmCustomerOrder(
      draft.value.aggregate,
      confirmCommand(draft.value.aggregate.version),
      RECORDED_AT,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CUSTOMER_ORDER_PRODUCT_REQUIRED");
  });

  it("confirms a priced order once and produces no financial or goods effect", () => {
    const draft = decideCreateCustomerOrderDraft(createCommand(), RECORDED_AT);
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    const result = decideConfirmCustomerOrder(
      draft.value.aggregate,
      confirmCommand(draft.value.aggregate.version),
      RECORDED_AT,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aggregate.status).toBe("confirmed");
    expect(result.value.aggregate.version).toBe(2);
    expect(result.value.aggregate.totalAmount).toEqual(vnd(225_000));
    expect(result.value.aggregate.confirmedAt).toBe(TRANSACTION_TIME);
    expect(result.value.accountEntries).toEqual([]);
    expect(result.value.audit.action).toBe("customer_order.confirmed");
  });
});

describe("BR-CUSTOMER-ORDER-003 / TC-CUSTOMER-ORDER-003", () => {
  it("rejects stale edits before changing the order", () => {
    const draft = decideCreateCustomerOrderDraft(createCommand(), RECORDED_AT);
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    const command: UpdateCustomerOrderDraftCommand = {
      ...createCommand(),
      expectedVersion: 0,
      payload: createCommand().payload,
    };
    const result = decideUpdateCustomerOrderDraft(draft.value.aggregate, command, RECORDED_AT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CUSTOMER_ORDER_VERSION_CONFLICT");
  });

  it("cancels with an explicit reason and no compensation", () => {
    const draft = decideCreateCustomerOrderDraft(createCommand(), RECORDED_AT);
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    const command: CancelCustomerOrderCommand = {
      ...confirmCommand(draft.value.aggregate.version),
      payload: { customerOrderId: ORDER_ID, reason: "Khách đổi lịch nhận" },
    };
    const result = decideCancelCustomerOrder(draft.value.aggregate, command, RECORDED_AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aggregate.status).toBe("cancelled");
    expect(result.value.aggregate.cancellationReason).toBe("Khách đổi lịch nhận");
    expect(result.value.accountEntries).toEqual([]);
  });
});
