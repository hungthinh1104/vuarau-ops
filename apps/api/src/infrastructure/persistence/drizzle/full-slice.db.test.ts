import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbTestContext, createUnitOfWork, hasDatabase, type DbTestContext } from "@vuarau/db";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import { createOrder } from "../../../modules/order/create-order.handler.ts";
import { confirmOrder } from "../../../modules/order/confirm-order.handler.ts";
import { recordCustomerPayment } from "../../../modules/payment/record-payment.handler.ts";
import { reverseCustomerPayment } from "../../../modules/payment/reverse-payment.handler.ts";
import { adjustCustomerDebt } from "../../../modules/debt/adjust-debt.handler.ts";
import { getCustomerDebtSummary, rebuildDebtSummary } from "../../../modules/debt/debt.queries.ts";

/**
 * The whole slice, end to end, against real Postgres: real transactions, real
 * row locks, real constraints, real triggers.
 *
 * The application tests prove the rules; this proves the Drizzle adapters
 * actually satisfy the ports and that the transaction boundary is real rather
 * than an artefact of the in-memory implementation.
 */
describe.skipIf(!hasDatabase)("full slice against Postgres", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;
  /** The command context an authenticated owner would have. */
  let owner: CommandContext;

  beforeAll(async () => {
    ctx = await createDbTestContext("full-slice");
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => new Date().toISOString() as ReturnType<CommandDeps["clock"]["now"]> },
    };
    owner = { deps, principal: { actorId: ctx.actorId, subject: ctx.subject } };
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const orderId = crypto.randomUUID();
  const paymentId = crypto.randomUUID();
  const reversalId = crypto.randomUUID();
  const transactionTime = "2026-07-20T05:00:00.000+07:00";

  const envelope = (key: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: key,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt: transactionTime,
  });

  const ledgerRows = () => ctx.ledgerRows();

  it("BR-SALE-007 / TC-SALE-003 — confirming creates exactly one ledger entry", async () => {
    const created = await createOrder(owner, {
      ...envelope("db-order-create"),
      payload: {
        orderId,
        customerId: ctx.customerId,
        currency: "VND",
        lines: [
          {
            lineId: crypto.randomUUID(),
            productId: ctx.productIds[0],
            productName: "Cà chua",
            quantity: { valueScaled: 12_500, unit: "kg" },
            unitPrice: { amountMinor: 18_000, currency: "VND" },
          },
          {
            lineId: crypto.randomUUID(),
            productId: ctx.productIds[1],
            productName: "Rau muống",
            quantity: { valueScaled: 30_000, unit: "bo" },
            unitPrice: { amountMinor: 5_000, currency: "VND" },
          },
          {
            lineId: crypto.randomUUID(),
            productId: ctx.productIds[2],
            productName: "Ớt hiểm",
            quantity: { valueScaled: 2_000, unit: "thung" },
            unitPrice: { amountMinor: 250_000, currency: "VND" },
          },
        ],
        note: null,
      },
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.totalAmount.amountMinor).toBe(875_000);
    // A draft moves no money.
    expect(await ledgerRows()).toHaveLength(0);

    const confirmed = await confirmOrder(owner, {
      ...envelope("db-order-confirm"),
      expectedVersion: 1,
      payload: { orderId },
    });

    expect(confirmed.ok).toBe(true);
    const entries = await ledgerRows();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.amount.amountMinor).toBe(875_000);
    expect(entries[0]?.sourceType).toBe("order_confirmation");
  });

  it("BR-COMMAND-001 / TC-SALE-004 — a retried confirmation does not duplicate debt", async () => {
    const replay = await confirmOrder(owner, {
      ...envelope("db-order-confirm"),
      expectedVersion: 1,
      payload: { orderId },
    });

    expect(replay.ok).toBe(true);
    expect(await ledgerRows()).toHaveLength(1);

    const summary = await getCustomerDebtSummary(owner, ctx.workspaceId, ctx.customerId);
    expect(summary.ok && summary.value.balance.amountMinor).toBe(875_000);
  });

  it("BR-SALE-006 / TC-SALE-005 — a stale version is rejected by the real update", async () => {
    const stale = await confirmOrder(owner, {
      ...envelope("db-order-confirm-stale"),
      expectedVersion: 1,
      payload: { orderId },
    });

    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error.code).toBe("ORDER_VERSION_CONFLICT");
  });

  it("BR-PAYMENT-002 / TC-PAYMENT-001 — a payment reduces the balance once", async () => {
    const paid = await recordCustomerPayment(owner, {
      ...envelope("db-payment-record"),
      payload: {
        paymentId,
        customerId: ctx.customerId,
        amount: { amountMinor: 500_000, currency: "VND" },
        method: "cash",
        payerName: "Tài xế anh Hùng",
        note: null,
      },
    });

    expect(paid.ok).toBe(true);
    const summary = await getCustomerDebtSummary(owner, ctx.workspaceId, ctx.customerId);
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;
    expect(summary.value.balance.amountMinor).toBe(375_000);
    expect(summary.value.entryCount).toBe(2);
  });

  it("BR-PAYMENT-005 / TC-PAYMENT-004 — a reversal compensates without erasing", async () => {
    const reversed = await reverseCustomerPayment(owner, {
      ...envelope("db-payment-reverse"),
      expectedVersion: 1,
      payload: {
        paymentId,
        reversalId,
        amount: { amountMinor: 500_000, currency: "VND" },
        reason: "Chuyển khoản bị hoàn",
      },
    });

    expect(reversed.ok).toBe(true);
    if (!reversed.ok) return;
    expect(reversed.value.status).toBe("reversed");

    const entries = await ledgerRows();
    expect(entries).toHaveLength(3);

    const original = entries.find((entry) => entry.sourceType === "payment");
    const compensating = entries.find((entry) => entry.sourceType === "payment_reversal");
    expect(original?.amount.amountMinor).toBe(-500_000);
    expect(compensating?.amount.amountMinor).toBe(500_000);
    expect(compensating?.reversalOfEntryId).toBe(original?.id);

    const summary = await getCustomerDebtSummary(owner, ctx.workspaceId, ctx.customerId);
    expect(summary.ok && summary.value.balance.amountMinor).toBe(875_000);
  });

  it("BR-ACCOUNT-003 / TC-ACCOUNT-003 — an adjustment carries its reason onto the entry", async () => {
    const adjusted = await adjustCustomerDebt(owner, {
      ...envelope("db-debt-adjust"),
      payload: {
        adjustmentId: crypto.randomUUID(),
        customerId: ctx.customerId,
        direction: "decrease",
        amount: { amountMinor: 250_000, currency: "VND" },
        reasonCode: "data_entry_correction",
        reason: "Đơn 875k ghi nhầm 2 thùng ớt, thực tế 1 thùng",
      },
    });

    expect(adjusted.ok).toBe(true);
    if (!adjusted.ok) return;
    expect(adjusted.value.balance.amountMinor).toBe(625_000);

    const entries = await ledgerRows();
    const adjustment = entries.find((entry) => entry.sourceType === "manual_adjustment");
    expect(adjustment?.reason).toBe("Đơn 875k ghi nhầm 2 thùng ớt, thực tế 1 thùng");
    expect(adjustment?.reasonCode).toBe("data_entry_correction");
  });

  it("BR-ACCOUNT-001 / TC-ACCOUNT-001 — the summary equals the sum of the stored entries", async () => {
    const entries = await ledgerRows();
    const sum = entries.reduce((total, entry) => total + entry.amount.amountMinor, 0);

    const summary = await getCustomerDebtSummary(owner, ctx.workspaceId, ctx.customerId);
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;
    expect(summary.value.balance.amountMinor).toBe(sum);
    expect(summary.value.entryCount).toBe(entries.length);
  });

  it("BR-ACCOUNT-006 / TC-ACCOUNT-002 — a rebuild reproduces the maintained summary exactly", async () => {
    const incremental = await getCustomerDebtSummary(owner, ctx.workspaceId, ctx.customerId);
    const rebuilt = await rebuildDebtSummary(deps, ctx.workspaceId, ctx.customerId);

    expect(incremental.ok).toBe(true);
    if (!incremental.ok) return;
    expect(rebuilt.balance).toEqual(incremental.value.balance);
    expect(rebuilt.entryCount).toBe(incremental.value.entryCount);
    expect(rebuilt.lastEntryTransactionTime).toBe(incremental.value.lastEntryTransactionTime);
  });

  it("BR-COMMAND-005 / TC-COMMAND-004 — a refused command leaves no row behind", async () => {
    const before = await ledgerRows();

    const refused = await recordCustomerPayment(owner, {
      ...envelope("db-payment-invalid"),
      payload: {
        paymentId: crypto.randomUUID(),
        customerId: ctx.customerId,
        amount: { amountMinor: 0, currency: "VND" },
        method: "cash",
        payerName: null,
        note: null,
      },
    });

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.code).toBe("PAYMENT_AMOUNT_INVALID");
    expect(await ledgerRows()).toHaveLength(before.length);
  });

  it("BR-CUSTOMER-002 / TC-CUSTOMER-002 — an actor cannot act in a workspace they do not belong to", async () => {
    // The owner of *this* depot, aiming at a workspace they are not a member of.
    const result = await recordCustomerPayment(owner, {
      ...envelope("db-payment-foreign"),
      workspaceId: ctx.foreignWorkspaceId,
      payload: {
        paymentId: crypto.randomUUID(),
        customerId: ctx.customerId,
        amount: { amountMinor: 100_000, currency: "VND" },
        method: "cash",
        payerName: null,
        note: null,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("WORKSPACE_ACCESS_DENIED");
  });

  it("BR-AUTH-002 / TC-AUTH-002 — a command may not name an actor other than the caller", async () => {
    const result = await recordCustomerPayment(owner, {
      ...envelope("db-payment-impersonate"),
      actorId: ctx.roleActors.sales,
      payload: {
        paymentId: crypto.randomUUID(),
        customerId: ctx.customerId,
        amount: { amountMinor: 100_000, currency: "VND" },
        method: "cash",
        payerName: null,
        note: null,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ACTOR_IMPERSONATION_DENIED");
  });

  it("BR-AUTH-004 / TC-AUTH-004 — sales cannot adjust debt against a real database", async () => {
    const salesActorId = ctx.roleActors.sales;
    const sales: CommandContext = {
      deps,
      principal: { actorId: salesActorId, subject: ctx.subjectOf(salesActorId) },
    };

    const before = await ledgerRows();
    const result = await adjustCustomerDebt(sales, {
      ...envelope("db-debt-adjust-sales"),
      actorId: salesActorId,
      payload: {
        adjustmentId: crypto.randomUUID(),
        customerId: ctx.customerId,
        direction: "decrease",
        amount: { amountMinor: 1_000_000, currency: "VND" },
        reasonCode: "write_off",
        reason: "Không được phép",
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PERMISSION_DENIED");
    expect(result.error.details).toMatchObject({ permission: "debt.adjust", role: "sales" });
    // The refusal wrote nothing at all.
    expect(await ledgerRows()).toHaveLength(before.length);
  });

  it("BR-AUTH-003 / TC-AUTH-003 — a revoked membership is refused, distinctly", async () => {
    const revoked: CommandContext = {
      deps,
      principal: {
        actorId: ctx.revokedActorId,
        subject: ctx.subjectOf(ctx.revokedActorId),
      },
    };

    const result = await recordCustomerPayment(revoked, {
      ...envelope("db-payment-revoked"),
      actorId: ctx.revokedActorId,
      payload: {
        paymentId: crypto.randomUUID(),
        customerId: ctx.customerId,
        amount: { amountMinor: 100_000, currency: "VND" },
        method: "cash",
        payerName: null,
        note: null,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("WORKSPACE_MEMBERSHIP_INACTIVE");
  });
});
