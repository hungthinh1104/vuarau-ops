import { beforeEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  customerDebtSummaryDtoSchema,
  orderDtoSchema,
  paymentDtoSchema,
  type DomainError,
} from "@vuarau/domain-contracts";
import {
  ACCOUNTANT_ACTOR_ID,
  ACTOR_ID,
  CUSTOMER_ID,
  LATER_TRANSACTION_TIME,
  ORDER_ID,
  PAYMENT_ID,
  SALES_ACTOR_ID,
  TRANSACTION_TIME,
  WAREHOUSE_ACTOR_ID,
  WORKSPACE_ID,
  orderLineInputs,
} from "@vuarau/test-fixtures";
import { createHarness, principalFor, type Harness } from "../../testing/command-test-harness.ts";
import { appRouter } from "./router.ts";
import { createTrustedContext } from "./context.ts";

/**
 * Contract tests exercise the real router through `createCaller` — no HTTP
 * server, no network, but the same procedures, the same schemas, and the same
 * error mapping a client would meet.
 */
let harness: Harness;
let caller: ReturnType<typeof appRouter.createCaller>;

beforeEach(() => {
  harness = createHarness();
  // An authenticated owner. Token verification itself is exercised in
  // `jwt-verifier.app.test.ts`; here the identity is taken as already resolved.
  caller = appRouter.createCaller(createTrustedContext(harness.deps, principalFor(ACTOR_ID)));
});

const envelope = (key: string, occurredAt: string = TRANSACTION_TIME) => ({
  commandId: crypto.randomUUID(),
  idempotencyKey: key,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt,
});

const orderPayload = {
  orderId: ORDER_ID,
  customerId: CUSTOMER_ID,
  currency: "VND" as const,
  lines: [...orderLineInputs],
  note: null,
};

/** Pulls the domain error out of a thrown tRPC error, or fails loudly. */
function domainErrorOf(error: unknown): DomainError {
  expect(error).toBeInstanceOf(TRPCError);
  const cause = (error as TRPCError).cause as { domainError?: DomainError } | undefined;
  expect(cause?.domainError).toBeDefined();
  return cause!.domainError!;
}

describe("UC-ORDER-001 / TC-SALE-013 — order procedures", () => {
  it("returns an OrderDto that satisfies the published schema", async () => {
    const created = await caller.order.create({
      ...envelope("contract-order-create"),
      payload: orderPayload,
    });

    // Parsing against the contract schema is the assertion: a DTO that drifts
    // from what clients were promised fails here, not in production.
    const parsed = orderDtoSchema.safeParse(created);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(created.totalAmount.amountMinor).toBe(875_000);
  });

  it("exposes server-computed capabilities on the draft", async () => {
    const created = await caller.order.create({
      ...envelope("contract-order-caps"),
      payload: orderPayload,
    });

    expect(created.capabilities.confirm.allowed).toBe(true);
    // Documented in the state machine, not implemented in this phase (ASM-005).
    expect(created.capabilities.cancel).toEqual({
      allowed: false,
      reasonCode: "COMMAND_NOT_AVAILABLE",
      details: { command: "CancelOrder" },
    });
  });

  it("flips the confirm capability once the order is confirmed", async () => {
    await caller.order.create({ ...envelope("contract-order-c1"), payload: orderPayload });
    const confirmed = await caller.order.confirm({
      ...envelope("contract-order-c2"),
      expectedVersion: 1,
      payload: { orderId: ORDER_ID },
    });

    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.capabilities.confirm).toEqual({
      allowed: false,
      reasonCode: "ORDER_ALREADY_CONFIRMED",
      details: { orderId: ORDER_ID },
    });
  });

  it("returns a stable domain code when confirming an empty order", async () => {
    await caller.order.create({
      ...envelope("contract-empty-create"),
      payload: { ...orderPayload, lines: [] },
    });

    try {
      await caller.order.confirm({
        ...envelope("contract-empty-confirm"),
        expectedVersion: 1,
        payload: { orderId: ORDER_ID },
      });
      expect.unreachable("confirming an empty order must be refused");
    } catch (error) {
      const domainError = domainErrorOf(error);
      expect(domainError.code).toBe("ORDER_EMPTY");
      expect(domainError.retryable).toBe(false);
    }
  });

  it("maps a version conflict to CONFLICT while keeping the domain code", async () => {
    await caller.order.create({ ...envelope("contract-conflict-create"), payload: orderPayload });
    await caller.order.confirm({
      ...envelope("contract-conflict-c1"),
      expectedVersion: 1,
      payload: { orderId: ORDER_ID },
    });

    try {
      await caller.order.confirm({
        ...envelope("contract-conflict-c2"),
        expectedVersion: 1,
        payload: { orderId: ORDER_ID },
      });
      expect.unreachable("a stale version must be refused");
    } catch (error) {
      expect((error as TRPCError).code).toBe("CONFLICT");
      expect(domainErrorOf(error).code).toBe("ORDER_VERSION_CONFLICT");
    }
  });
});

describe("UC-PAYMENT-001 / TC-PAYMENT-012 — payment procedures", () => {
  it("returns a PaymentDto that satisfies the published schema", async () => {
    const payment = await caller.payment.record({
      ...envelope("contract-payment", LATER_TRANSACTION_TIME),
      payload: {
        paymentId: PAYMENT_ID,
        customerId: CUSTOMER_ID,
        amount: { amountMinor: 500_000, currency: "VND" },
        method: "cash",
        payerName: null,
        note: null,
      },
    });

    const parsed = paymentDtoSchema.safeParse(payment);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(payment.remainingReversibleAmount.amountMinor).toBe(500_000);
    expect(payment.capabilities.reverse.allowed).toBe(true);
  });

  it("reports the remaining reversible amount in the error details", async () => {
    await caller.payment.record({
      ...envelope("contract-payment-2", LATER_TRANSACTION_TIME),
      payload: {
        paymentId: PAYMENT_ID,
        customerId: CUSTOMER_ID,
        amount: { amountMinor: 500_000, currency: "VND" },
        method: "cash",
        payerName: null,
        note: null,
      },
    });

    try {
      await caller.payment.reverse({
        ...envelope("contract-reverse-too-much", LATER_TRANSACTION_TIME),
        expectedVersion: 1,
        payload: {
          paymentId: PAYMENT_ID,
          reversalId: crypto.randomUUID(),
          amount: { amountMinor: 600_000, currency: "VND" },
          reason: "Sai số tiền",
        },
      });
      expect.unreachable("over-reversal must be refused");
    } catch (error) {
      const domainError = domainErrorOf(error);
      expect(domainError.code).toBe("PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT");
      // The UI can say "only 500.000 ₫ can be reversed" without parsing prose.
      expect(domainError.details).toMatchObject({ requested: 600_000, remaining: 500_000 });
    }
  });
});

describe("UC-ACCOUNT-002 / TC-ACCOUNT-008 — debt procedures", () => {
  it("returns a summary that satisfies the published schema", async () => {
    const summary = await caller.debt.summary({
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
    });

    const parsed = customerDebtSummaryDtoSchema.safeParse(summary);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(summary.balance.amountMinor).toBe(0);
  });

  it("exposes the ledger behind a balance", async () => {
    await caller.debt.adjust({
      ...envelope("contract-adjust"),
      payload: {
        adjustmentId: crypto.randomUUID(),
        customerId: CUSTOMER_ID,
        direction: "increase",
        amount: { amountMinor: 50_000, currency: "VND" },
        reasonCode: "opening_balance",
        reason: "Nợ cũ từ sổ giấy",
      },
    });

    const ledger = await caller.debt.ledger({
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
    });

    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.reason).toBe("Nợ cũ từ sổ giấy");
    expect(ledger[0]?.actorId).toBe(ACTOR_ID);
  });

  it("refuses an adjustment with no reason, with the specific code", async () => {
    try {
      await caller.debt.adjust({
        ...envelope("contract-adjust-no-reason"),
        payload: {
          adjustmentId: crypto.randomUUID(),
          customerId: CUSTOMER_ID,
          direction: "increase",
          amount: { amountMinor: 50_000, currency: "VND" },
          reasonCode: "other",
          reason: "  ",
        },
      });
      expect.unreachable("a blank reason must be refused");
    } catch (error) {
      expect(domainErrorOf(error).code).toBe("DEBT_ADJUSTMENT_REASON_REQUIRED");
    }
  });
});

describe("BR-AUTH-002 / TC-CUSTOMER-003 — actor impersonation", () => {
  it("refuses a command whose actorId is not the authenticated actor", async () => {
    try {
      await caller.order.create({
        ...envelope("contract-impersonate"),
        actorId: SALES_ACTOR_ID,
        payload: orderPayload,
      });
      expect.unreachable("acting as another actor must be refused");
    } catch (error) {
      expect(domainErrorOf(error).code).toBe("ACTOR_IMPERSONATION_DENIED");
      expect((error as TRPCError).code).toBe("FORBIDDEN");
    }
  });

  it("allows a command whose actorId matches the authenticated actor", async () => {
    const created = await caller.order.create({
      ...envelope("contract-authenticated"),
      payload: orderPayload,
    });
    expect(created.status).toBe("draft");
  });
});

describe("BR-AUTH-001 / TC-AUTH-001 — unauthenticated access", () => {
  it("refuses every procedure when no identity was established", async () => {
    const anonymous = appRouter.createCaller({
      deps: harness.deps,
      principal: null,
      authError: {
        code: "AUTHENTICATION_REQUIRED",
        message: "This operation requires an access token.",
        retryable: false,
      },
    });

    await expect(
      anonymous.debt.summary({ workspaceId: WORKSPACE_ID, customerId: CUSTOMER_ID }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await expect(
      anonymous.order.create({ ...envelope("contract-anon"), payload: orderPayload }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("refuses a read of a debt ledger without a token — this was open before Milestone 1", async () => {
    const anonymous = appRouter.createCaller({
      deps: harness.deps,
      principal: null,
      authError: {
        code: "AUTHENTICATION_INVALID",
        message: "The access token is not valid.",
        retryable: false,
      },
    });

    try {
      await anonymous.debt.ledger({ workspaceId: WORKSPACE_ID, customerId: CUSTOMER_ID });
      expect.unreachable("an unauthenticated ledger read must be refused");
    } catch (error) {
      expect(domainErrorOf(error).code).toBe("AUTHENTICATION_INVALID");
    }
  });
});

describe("BR-AUTH-006 / TC-AUTH-006 — debt capabilities on the summary", () => {
  it("tells an owner they may adjust debt", async () => {
    const summary = await caller.debt.summary({
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
    });
    expect(summary.capabilities.adjust).toEqual({ allowed: true });
  });

  it("tells a warehouse worker they may not, with the code the command would return", async () => {
    const warehouse = appRouter.createCaller(
      createTrustedContext(harness.deps, principalFor(WAREHOUSE_ACTOR_ID)),
    );

    try {
      await warehouse.debt.summary({ workspaceId: WORKSPACE_ID, customerId: CUSTOMER_ID });
      expect.unreachable("warehouse has no debt.read permission");
    } catch (error) {
      expect(domainErrorOf(error).code).toBe("PERMISSION_DENIED");
    }
  });

  it("tells an accountant they may adjust debt", async () => {
    const accountant = appRouter.createCaller(
      createTrustedContext(harness.deps, principalFor(ACCOUNTANT_ACTOR_ID)),
    );

    const summary = await accountant.debt.summary({
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
    });
    expect(summary.capabilities.adjust).toEqual({ allowed: true });
  });
});

describe("TC-COMMAND-007 — malformed input", () => {
  it("returns INVALID_COMMAND_PAYLOAD rather than a raw schema dump", async () => {
    try {
      await caller.payment.record({
        ...envelope("contract-malformed", LATER_TRANSACTION_TIME),
        payload: {
          paymentId: PAYMENT_ID,
          customerId: CUSTOMER_ID,
          // A float amount: money is integer minor units (ADR-0006).
          amount: { amountMinor: 500_000.5, currency: "VND" },
          method: "cash",
          payerName: null,
          note: null,
        },
      });
      expect.unreachable("a non-integer amount must be refused");
    } catch (error) {
      expect((error as TRPCError).code).toBe("BAD_REQUEST");
    }
  });
});
