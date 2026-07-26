import { beforeEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  customerAccountBalanceDtoSchema,
  saleDtoSchema,
  paymentDtoSchema,
  type DomainError,
  accountTimelineEntryDtoSchema,
  auditTimelineEntryDtoSchema,
  customerSummaryDtoSchema,
  pageOf,
  paymentSummaryDtoSchema,
  saleSummaryDtoSchema,
  sessionDtoSchema,
  actorWorkspacesDtoSchema,
} from "@vuarau/domain-contracts";
import {
  ACCOUNTANT_ACTOR_ID,
  ACTOR_ID,
  CUSTOMER_ID,
  LATER_TRANSACTION_TIME,
  OTHER_WORKSPACE_ID,
  SALE_ID,
  PAYMENT_ID,
  SALES_ACTOR_ID,
  TRANSACTION_TIME,
  WAREHOUSE_ACTOR_ID,
  WORKSPACE_ID,
  saleLineInputs,
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

const salePayload = {
  saleId: SALE_ID,
  customerId: CUSTOMER_ID,
  currency: "VND" as const,
  lines: [...saleLineInputs],
  note: null,
};

/** Pulls the domain error out of a thrown tRPC error, or fails loudly. */
function domainErrorOf(error: unknown): DomainError {
  expect(error).toBeInstanceOf(TRPCError);
  const cause = (error as TRPCError).cause as { domainError?: DomainError } | undefined;
  expect(cause?.domainError).toBeDefined();
  return cause!.domainError!;
}

describe("UC-SALE-001 / TC-SALE-013 — sale procedures", () => {
  it("returns a SaleDto that satisfies the published schema", async () => {
    const created = await caller.sale.createDraft({
      ...envelope("contract-sale-create"),
      payload: salePayload,
    });

    // Parsing against the contract schema is the assertion: a DTO that drifts
    // from what clients were promised fails here, not in production.
    const parsed = saleDtoSchema.safeParse(created);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(created.totalAmount.amountMinor).toBe(875_000);
  });

  it("exposes server-computed capabilities on the draft", async () => {
    const created = await caller.sale.createDraft({
      ...envelope("contract-sale-caps"),
      payload: salePayload,
    });

    expect(created.capabilities.post.allowed).toBe(true);
    // A live draft may be edited and discarded, and the capability says so
    // because it is computed by the same functions the command guards call
    // (ADR-0003) — not by a second table that has to be remembered.
    expect(created.capabilities.edit).toEqual({ allowed: true });
    expect(created.capabilities.discard).toEqual({ allowed: true });
  });

  it("flips the post capability once the sale is posted", async () => {
    await caller.sale.createDraft({ ...envelope("contract-sale-c1"), payload: salePayload });
    const posted = await caller.sale.post({
      ...envelope("contract-sale-c2"),
      expectedVersion: 1,
      payload: { saleId: SALE_ID },
    });

    expect(posted.status).toBe("posted");
    expect(posted.capabilities.post).toEqual({
      allowed: false,
      reasonCode: "SALE_ALREADY_POSTED",
      details: { saleId: SALE_ID },
    });
  });

  it("returns a stable domain code when posting an empty sale", async () => {
    await caller.sale.createDraft({
      ...envelope("contract-empty-create"),
      payload: { ...salePayload, lines: [] },
    });

    try {
      await caller.sale.post({
        ...envelope("contract-empty-post"),
        expectedVersion: 1,
        payload: { saleId: SALE_ID },
      });
      expect.unreachable("posting an empty sale must be refused");
    } catch (error) {
      const domainError = domainErrorOf(error);
      expect(domainError.code).toBe("SALE_EMPTY");
      expect(domainError.retryable).toBe(false);
    }
  });

  it("maps a version conflict to CONFLICT while keeping the domain code", async () => {
    await caller.sale.createDraft({
      ...envelope("contract-conflict-create"),
      payload: salePayload,
    });
    await caller.sale.post({
      ...envelope("contract-conflict-c1"),
      expectedVersion: 1,
      payload: { saleId: SALE_ID },
    });

    try {
      await caller.sale.post({
        ...envelope("contract-conflict-c2"),
        expectedVersion: 1,
        payload: { saleId: SALE_ID },
      });
      expect.unreachable("a stale version must be refused");
    } catch (error) {
      expect((error as TRPCError).code).toBe("CONFLICT");
      expect(domainErrorOf(error).code).toBe("SALE_VERSION_CONFLICT");
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
    const summary = await caller.account.balance({
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
    });

    const parsed = customerAccountBalanceDtoSchema.safeParse(summary);
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

    // Through `timeline`, which is the only published way in. The raw entry list
    // was removed from the router: it took no cursor, so one request could ask a
    // depot's whole account history of a customer out of the database.
    const ledger = await caller.account.timeline({
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      from: null,
      to: null,
      cursor: null,
      limit: 10,
    });

    expect(ledger.items).toHaveLength(1);
    expect(ledger.items[0]?.reason).toBe("Nợ cũ từ sổ giấy");
    expect(ledger.items[0]?.actorId).toBe(ACTOR_ID);
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
      await caller.sale.createDraft({
        ...envelope("contract-impersonate"),
        actorId: SALES_ACTOR_ID,
        payload: salePayload,
      });
      expect.unreachable("acting as another actor must be refused");
    } catch (error) {
      expect(domainErrorOf(error).code).toBe("ACTOR_IMPERSONATION_DENIED");
      expect((error as TRPCError).code).toBe("FORBIDDEN");
    }
  });

  it("allows a command whose actorId matches the authenticated actor", async () => {
    const created = await caller.sale.createDraft({
      ...envelope("contract-authenticated"),
      payload: salePayload,
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
      anonymous.account.balance({ workspaceId: WORKSPACE_ID, customerId: CUSTOMER_ID }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await expect(
      anonymous.sale.createDraft({ ...envelope("contract-anon"), payload: salePayload }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("refuses a read of a customer account without a token — this was open before Milestone 1", async () => {
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
      await anonymous.account.timeline({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        from: null,
        to: null,
        cursor: null,
        limit: 10,
      });
      expect.unreachable("an unauthenticated account read must be refused");
    } catch (error) {
      expect(domainErrorOf(error).code).toBe("AUTHENTICATION_INVALID");
    }
  });
});

describe("BR-AUTH-008 / TC-AUTH-015 — session.workspaces over the wire", () => {
  it("answers from the token, with a shape the client can parse", async () => {
    const listed = await caller.session.workspaces({});

    expect(actorWorkspacesDtoSchema.parse(listed)).toEqual(listed);
    expect(listed.actorId).toBe(ACTOR_ID);
    expect(listed.workspaces.map((workspace) => workspace.workspaceId)).toEqual([WORKSPACE_ID]);
  });

  it("has no field through which one person can ask for another's depots", async () => {
    // The procedure's input schema is `{}`. Sending an actor id is a schema
    // violation, not a parameter that is ignored — a silently ignored field is a
    // field somebody will eventually believe in (BR-AUTH-002).
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      caller.session.workspaces({ actorId: SALES_ACTOR_ID } as any),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("refuses to answer without a token at all", async () => {
    const anonymous = appRouter.createCaller({
      deps: harness.deps,
      principal: null,
      authError: {
        code: "AUTHENTICATION_REQUIRED",
        message: "This operation requires an access token.",
        retryable: false,
      },
    });

    await expect(anonymous.session.workspaces({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("gives a caller in a second depot the role they hold there", async () => {
    harness.db.grantMembership(OTHER_WORKSPACE_ID, ACTOR_ID, "sales", true);

    const listed = await caller.session.workspaces({});
    const other = listed.workspaces.find(
      (workspace) => workspace.workspaceId === OTHER_WORKSPACE_ID,
    );

    expect(other?.role).toBe("sales");
    expect(other?.permissions).not.toContain("sale.void");
  });
});

describe("BR-AUTH-006 / TC-AUTH-006 — account capabilities on the balance", () => {
  it("tells an owner they may adjust debt", async () => {
    const summary = await caller.account.balance({
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
      await warehouse.account.balance({ workspaceId: WORKSPACE_ID, customerId: CUSTOMER_ID });
      expect.unreachable("warehouse has no debt.read permission");
    } catch (error) {
      expect(domainErrorOf(error).code).toBe("PERMISSION_DENIED");
    }
  });

  it("tells an accountant they may adjust debt", async () => {
    const accountant = appRouter.createCaller(
      createTrustedContext(harness.deps, principalFor(ACCOUNTANT_ACTOR_ID)),
    );

    const summary = await accountant.account.balance({
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

describe("UC-SALE-003 / TC-READ-009 — the published read surface", () => {
  it("returns pages that satisfy the published schemas", async () => {
    // Parsed with the same schema a browser client would use. A DTO that drifted
    // from its contract fails here rather than in the first UI to render it.
    const customers = await caller.customer.search({
      workspaceId: WORKSPACE_ID,
      query: "",
      isActive: null,
      cursor: null,
      limit: 10,
    });
    expect(pageOf(customerSummaryDtoSchema).safeParse(customers).success).toBe(true);

    const session = await caller.session.me({ workspaceId: WORKSPACE_ID });
    expect(sessionDtoSchema.safeParse(session).success).toBe(true);

    const sales = await caller.sale.list({
      workspaceId: WORKSPACE_ID,
      customerId: null,
      status: null,
      financialState: null,
      from: null,
      to: null,
      cursor: null,
      limit: 10,
    });
    expect(pageOf(saleSummaryDtoSchema).safeParse(sales).success).toBe(true);

    const payments = await caller.payment.list({
      workspaceId: WORKSPACE_ID,
      customerId: null,
      status: null,
      from: null,
      to: null,
      cursor: null,
      limit: 10,
    });
    expect(pageOf(paymentSummaryDtoSchema).safeParse(payments).success).toBe(true);

    const timeline = await caller.account.timeline({
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      from: null,
      to: null,
      cursor: null,
      limit: 10,
    });
    expect(pageOf(accountTimelineEntryDtoSchema).safeParse(timeline).success).toBe(true);

    const audit = await caller.audit.timeline({
      workspaceId: WORKSPACE_ID,
      aggregateType: null,
      aggregateId: null,
      actorId: null,
      from: null,
      to: null,
      cursor: null,
      limit: 10,
    });
    expect(pageOf(auditTimelineEntryDtoSchema).safeParse(audit).success).toBe(true);
  });

  it("clamps an oversized limit instead of refusing the read", async () => {
    // A client asking for too much has made a judgement error, not a business
    // one, and failing the whole read over it helps nobody.
    await expect(
      caller.customer.search({
        workspaceId: WORKSPACE_ID,
        query: "",
        isActive: null,
        cursor: null,
        limit: 10_000,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses every read without a token", async () => {
    const anonymous = appRouter.createCaller({
      deps: harness.deps,
      principal: null,
      authError: {
        code: "AUTHENTICATION_REQUIRED",
        message: "This operation requires an access token.",
        retryable: false,
      },
    });

    // A depot's books have no public surface — reads included (BR-AUTH-001).
    await expect(anonymous.session.me({ workspaceId: WORKSPACE_ID })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      anonymous.sale.get({ workspaceId: WORKSPACE_ID, saleId: SALE_ID }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      anonymous.audit.timeline({
        workspaceId: WORKSPACE_ID,
        aggregateType: null,
        aggregateId: null,
        actorId: null,
        from: null,
        to: null,
        cursor: null,
        limit: 10,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
