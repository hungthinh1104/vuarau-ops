import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  captureDatabaseError,
  eq,
  sql,
  cashBalances,
  cashMovements,
  customerAccountEntries,
  createDbTestContext,
  createUnitOfWork,
  expenses,
  skipWithoutDatabase,
  workspaceOperationalProfiles,
  type DbTestContext,
} from "@vuarau/db";
import type {
  CashAccountId,
  ExpenseId,
  PaymentId,
} from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import { createCashAccount, recordExpense } from "../../../modules/cash/cash.handlers.ts";
import { recordCustomerPayment } from "../../../modules/payment/record-payment.handler.ts";
import { getCashReconciliation } from "../../../modules/cash/cash.queries.ts";

describe.skipIf(skipWithoutDatabase())("cashbook against PostgreSQL", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;
  const accountId = crypto.randomUUID() as CashAccountId;
  const context = (): CommandContext => ({
    deps,
    principal: { actorId: ctx.actorId, subject: ctx.subject },
  });
  const command = (key: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: `${key}-${crypto.randomUUID()}`,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt: new Date().toISOString(),
  });

  beforeAll(async () => {
    ctx = await createDbTestContext(`cashbook-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: {
        now: () => new Date().toISOString() as ReturnType<CommandDeps["clock"]["now"]>,
      },
    };
    await ctx.database.db
      .update(workspaceOperationalProfiles)
      .set({ cashbookMode: "accounts_ledger", version: 2 })
      .where(eq(workspaceOperationalProfiles.workspaceId, ctx.workspaceId));
    expect(
      (
        await createCashAccount(context(), {
          ...command("cash-account"),
          payload: {
            cashAccountId: accountId,
            displayName: "Két chính",
            kind: "cash_drawer",
            currency: "VND",
            custodianActorId: null,
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it("TC-CASH-008 — commits customer debt and money location exactly once", async () => {
    const paymentId = crypto.randomUUID() as PaymentId;
    const payment = {
      ...command("cash-payment"),
      payload: {
        paymentId,
        customerId: ctx.customerId,
        amount: { amountMinor: 700_000, currency: "VND" as const },
        method: "cash" as const,
        cashAccountId: accountId,
        payerName: null,
        note: null,
      },
    };
    expect((await recordCustomerPayment(context(), payment)).ok).toBe(true);
    expect((await recordCustomerPayment(context(), payment)).ok).toBe(true);

    const movements = await ctx.database.db
      .select()
      .from(cashMovements)
      .where(eq(cashMovements.sourceId, paymentId));
    expect(movements).toHaveLength(1);
    expect(movements[0]?.amountMinor).toBe(700_000);
    const customerEntries = await ctx.database.db
      .select({ amountMinor: customerAccountEntries.amountMinor })
      .from(customerAccountEntries)
      .where(eq(customerAccountEntries.sourceId, paymentId));
    expect(customerEntries).toEqual([{ amountMinor: -700_000 }]);

    const balances = await ctx.database.db
      .select()
      .from(cashBalances)
      .where(eq(cashBalances.cashAccountId, accountId));
    expect(balances[0]).toMatchObject({ balanceMinor: 700_000, movementCount: 1 });
    const reconciliation = await getCashReconciliation(context(), {
      workspaceId: ctx.workspaceId,
      cashAccountId: accountId,
    });
    expect(reconciliation.ok && reconciliation.value.status).toBe("consistent");
  });

  it("TC-CASH-009 — database guards canonical expense and movement facts from mutation", async () => {
    const expenseId = crypto.randomUUID() as ExpenseId;
    expect(
      (
        await recordExpense(context(), {
          ...command("expense"),
          payload: {
            expenseId,
            cashAccountId: accountId,
            category: "market_fee",
            amount: { amountMinor: 50_000, currency: "VND" },
            payee: "Ban quản lý chợ",
            note: "Phí chợ",
          },
        })
      ).ok,
    ).toBe(true);

    const expenseError = await captureDatabaseError(
      ctx.database.db.execute(sql`
        update expenses set note = 'rewritten' where workspace_id = ${ctx.workspaceId}::uuid
          and id = ${expenseId}::uuid
      `),
    );
    expect(expenseError).toMatch(/append-only|compensating/i);

    const movementError = await captureDatabaseError(
      ctx.database.db.execute(sql`
        delete from cash_movements where workspace_id = ${ctx.workspaceId}::uuid
          and source_id = ${expenseId}::uuid
      `),
    );
    expect(movementError).toMatch(/append-only|compensating/i);
    expect(
      await ctx.database.db
        .select({ id: expenses.id })
        .from(expenses)
        .where(eq(expenses.id, expenseId)),
    ).toHaveLength(1);
  });

  it("TC-CASH-010 — concurrent payment retries create one debt and one cash effect", async () => {
    const paymentId = crypto.randomUUID() as PaymentId;
    const first = {
      ...command("cash-concurrent-retry"),
      payload: {
        paymentId,
        customerId: ctx.customerId,
        amount: { amountMinor: 125_000, currency: "VND" as const },
        method: "cash" as const,
        cashAccountId: accountId,
        payerName: null,
        note: null,
      },
    };
    const retry = { ...first, commandId: crypto.randomUUID() };
    const results = await Promise.all([
      recordCustomerPayment(context(), first),
      recordCustomerPayment(context(), retry),
    ]);

    expect(results.every((result) => result.ok)).toBe(true);
    const movements = await ctx.database.db
      .select({ id: cashMovements.id })
      .from(cashMovements)
      .where(eq(cashMovements.sourceId, paymentId));
    const entries = await ctx.database.db
      .select({ id: customerAccountEntries.id })
      .from(customerAccountEntries)
      .where(eq(customerAccountEntries.sourceId, paymentId));
    expect(movements).toHaveLength(1);
    expect(entries).toHaveLength(1);
  });
});
