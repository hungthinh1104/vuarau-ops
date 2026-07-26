import { describe, expect, it } from "vitest";
import type { CreateCustomerCommand } from "@vuanha/domain-contracts";
import {
  ACTOR_ID,
  COMMAND_ID,
  CUSTOMER_ID,
  IDEMPOTENCY_KEY,
  RECORDED_AT,
  TRANSACTION_TIME,
  WORKSPACE_ID,
} from "@vuanha/test-fixtures";
import { decideCreateCustomer } from "./index.ts";

function createCustomerCommand(
  overrides: Partial<CreateCustomerCommand["payload"]> = {},
): CreateCustomerCommand {
  return {
    commandId: COMMAND_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: TRANSACTION_TIME,
    payload: {
      customerId: CUSTOMER_ID,
      displayName: "Chị Lan chợ Bình Điền",
      phone: "0901234567",
      note: null,
      ...overrides,
    },
  };
}

describe("BR-CUSTOMER-001 / TC-CUSTOMER-001", () => {
  it("creates an active customer at version 1", () => {
    const result = decideCreateCustomer({
      command: createCustomerCommand(),
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.aggregate.displayName).toBe("Chị Lan chợ Bình Điền");
    expect(result.value.aggregate.isActive).toBe(true);
    expect(result.value.aggregate.version).toBe(1);
    expect(result.value.aggregate.workspaceId).toBe(WORKSPACE_ID);
  });

  it("refuses a blank display name", () => {
    const result = decideCreateCustomer({
      command: createCustomerCommand({ displayName: "   " }),
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CUSTOMER_NAME_REQUIRED");
  });

  it("accepts a customer with no phone number", () => {
    // Making the phone mandatory teaches workers to type 0000000000.
    const result = decideCreateCustomer({
      command: createCustomerCommand({ phone: null }),
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aggregate.phone).toBeNull();
  });

  it("moves no money", () => {
    // A new customer's debt is zero because they have no ledger entries — not
    // because a zero was written anywhere (ADR-0004).
    const result = decideCreateCustomer({
      command: createCustomerCommand(),
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ledgerEntries).toHaveLength(0);
  });

  it("trims the stored name", () => {
    const result = decideCreateCustomer({
      command: createCustomerCommand({ displayName: "  Cô Bảy  " }),
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aggregate.displayName).toBe("Cô Bảy");
  });
});
