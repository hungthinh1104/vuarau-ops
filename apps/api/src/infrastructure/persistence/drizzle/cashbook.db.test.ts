import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  captureDatabaseError,
  eq,
  sql,
  cashBalances,
  cashMovements,
  cashAdjustments,
  cashTransferReversals,
  cashTransfers,
  customerAccountEntries,
  expenseReversals,
  payments,
  createDbTestContext,
  createUnitOfWork,
  expenses,
  skipWithoutDatabase,
  workspaceOperationalProfiles,
  type DbTestContext,
} from "@vuarau/db";
import type {
  CashAccountId,
  CashAdjustmentId,
  CashTransferId,
  ExpenseId,
  ExpenseReversalId,
  CashTransferReversalId,
  PaymentId,
} from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import {
  adjustCash,
  createCashAccount,
  recordCashTransfer,
  recordExpense,
  reverseCashTransfer,
  reverseExpense,
} from "../../../modules/cash/cash.handlers.ts";
import { recordCustomerPayment } from "../../../modules/payment/record-payment.handler.ts";
import { getCashReconciliation } from "../../../modules/cash/cash.queries.ts";

describe.skipIf(skipWithoutDatabase())("cashbook against PostgreSQL", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;
  const accountId = crypto.randomUUID() as CashAccountId;
  const bankAccountId = crypto.randomUUID() as CashAccountId;
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
    expect(
      (
        await createCashAccount(context(), {
          ...command("cash-bank-account"),
          payload: {
            cashAccountId: bankAccountId,
            displayName: "Ngân hàng",
            kind: "bank",
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
        evidenceReferences: ["receipt://cashbook/001", "photo://cashbook/001"],
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
    const paymentRows = await ctx.database.db
      .select({ evidenceReferences: payments.evidenceReferences })
      .from(payments)
      .where(eq(payments.id, paymentId));
    expect(paymentRows[0]?.evidenceReferences).toEqual([
      "receipt://cashbook/001",
      "photo://cashbook/001",
    ]);
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
            evidenceReferences: ["receipt://cash/expense/009"],
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

    const reversalId = crypto.randomUUID() as ExpenseReversalId;
    expect(
      (
        await reverseExpense(context(), {
          ...command("expense-reversal"),
          payload: {
            reversalId,
            expenseId,
            reason: "Hoàn phí ghi nhầm",
            evidenceReferences: ["note://cash/expense-reversal/009"],
          },
        })
      ).ok,
    ).toBe(true);

    const transferId = crypto.randomUUID() as CashTransferId;
    const transferReversalId = crypto.randomUUID() as CashTransferReversalId;
    expect(
      (
        await recordCashTransfer(context(), {
          ...command("cash-transfer"),
          payload: {
            transferId,
            fromCashAccountId: accountId,
            toCashAccountId: bankAccountId,
            amount: { amountMinor: 20_000, currency: "VND" },
            note: "Nộp tiền",
            evidenceReferences: ["bank-slip://cash/transfer/009"],
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await reverseCashTransfer(context(), {
          ...command("cash-transfer-reversal"),
          payload: {
            transferId,
            reversalId: transferReversalId,
            reason: "Chuyển nhầm",
            evidenceReferences: ["note://cash/transfer-reversal/009"],
          },
        })
      ).ok,
    ).toBe(true);

    const adjustmentId = crypto.randomUUID() as CashAdjustmentId;
    expect(
      (
        await adjustCash(context(), {
          ...command("cash-adjustment"),
          payload: {
            adjustmentId,
            cashAccountId: accountId,
            direction: "increase",
            amount: { amountMinor: 10_000, currency: "VND" },
            reasonCode: "owner_contribution",
            reason: "Bổ sung tiền mặt",
            evidenceReferences: ["cash-count://cash/adjustment/009"],
          },
        })
      ).ok,
    ).toBe(true);

    expect(
      (
        await ctx.database.db
          .select({ evidenceReferences: expenses.evidenceReferences })
          .from(expenses)
          .where(eq(expenses.id, expenseId))
      )[0]?.evidenceReferences,
    ).toEqual(["receipt://cash/expense/009"]);
    expect(
      (
        await ctx.database.db
          .select({ evidenceReferences: expenseReversals.evidenceReferences })
          .from(expenseReversals)
          .where(eq(expenseReversals.id, reversalId))
      )[0]?.evidenceReferences,
    ).toEqual(["note://cash/expense-reversal/009"]);
    expect(
      (
        await ctx.database.db
          .select({ evidenceReferences: cashTransfers.evidenceReferences })
          .from(cashTransfers)
          .where(eq(cashTransfers.id, transferId))
      )[0]?.evidenceReferences,
    ).toEqual(["bank-slip://cash/transfer/009"]);
    expect(
      (
        await ctx.database.db
          .select({ evidenceReferences: cashTransferReversals.evidenceReferences })
          .from(cashTransferReversals)
          .where(eq(cashTransferReversals.id, transferReversalId))
      )[0]?.evidenceReferences,
    ).toEqual(["note://cash/transfer-reversal/009"]);
    expect(
      (
        await ctx.database.db
          .select({ evidenceReferences: cashAdjustments.evidenceReferences })
          .from(cashAdjustments)
          .where(eq(cashAdjustments.id, adjustmentId))
      )[0]?.evidenceReferences,
    ).toEqual(["cash-count://cash/adjustment/009"]);
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
