import type {
  AdjustCashCommand,
  CashAccountDto,
  CashBalanceDto,
  CashTransferDto,
  CreateCashAccountCommand,
  DeactivateCashAccountCommand,
  ExpenseDto,
  ReactivateCashAccountCommand,
  RecordCashTransferCommand,
  RecordExpenseCommand,
  ReverseCashTransferCommand,
  ReverseExpenseCommand,
  UpdateCashAccountCommand,
  RebuildCashBalanceCommand,
} from "@vuarau/domain-contracts";
import {
  adjustCashCommandSchema,
  createCashAccountCommandSchema,
  deactivateCashAccountCommandSchema,
  reactivateCashAccountCommandSchema,
  rebuildCashBalanceCommandSchema,
  recordCashTransferCommandSchema,
  recordExpenseCommandSchema,
  reverseCashTransferCommandSchema,
  reverseExpenseCommandSchema,
  updateCashAccountCommandSchema,
} from "@vuarau/domain-contracts";
import {
  decideAdjustCash,
  decideCashAccountLifecycle,
  decideCreateCashAccount,
  decideRecordCashTransfer,
  decideRecordExpense,
  decideReverseCashTransfer,
  decideReverseExpense,
  decideUpdateCashAccount,
  err,
  ok,
} from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { applyCashMovements } from "./cash-effects.ts";

const audit = async (
  repos: Parameters<Parameters<CommandContext["deps"]["uow"]["transaction"]>[0]>[0],
  command: { workspaceId: string; actorId: string; commandId: string },
  draft: Parameters<typeof repos.audit.append>[0],
) =>
  repos.audit.append({
    ...draft,
    workspaceId: command.workspaceId,
    actorId: command.actorId,
    commandId: command.commandId,
  } as Parameters<typeof repos.audit.append>[0]);

export function createCashAccount(ctx: CommandContext, input: unknown) {
  return runCommand<CreateCashAccountCommand, CashAccountDto>({
    commandType: "CreateCashAccount",
    schema: createCashAccountCommandSchema,
    input,
    ctx,
    requiredPermission: "cash.account.manage",
    requiredWorkflows: ["cashbook"],
    execute: async ({ command, repos, recordedAt }) => {
      const decision = decideCreateCashAccount(command, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.cashAccounts.insert(decision.value.account))) {
        return err("CASH_ACCOUNT_VERSION_CONFLICT", "Cash account identity already exists.");
      }
      await audit(repos, command, decision.value.audit as never);
      return ok(decision.value.account);
    },
  });
}

export function updateCashAccount(ctx: CommandContext, input: unknown) {
  return runCommand<UpdateCashAccountCommand, CashAccountDto>({
    commandType: "UpdateCashAccount",
    schema: updateCashAccountCommandSchema,
    input,
    ctx,
    requiredPermission: "cash.account.manage",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.cashAccounts.findByIdForUpdate(
        command.workspaceId,
        command.payload.cashAccountId,
      );
      if (current === null) return err("CASH_ACCOUNT_NOT_FOUND", "No such cash account.");
      const decision = decideUpdateCashAccount(command, current, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.cashAccounts.update(decision.value.account, current.version))) {
        return err("CASH_ACCOUNT_VERSION_CONFLICT", "Cash account changed concurrently.");
      }
      await audit(repos, command, decision.value.audit as never);
      return ok(decision.value.account);
    },
  });
}

function cashAccountLifecycle(
  ctx: CommandContext,
  input: unknown,
  targetActive: boolean,
) {
  const schema = targetActive
    ? reactivateCashAccountCommandSchema
    : deactivateCashAccountCommandSchema;
  return runCommand<DeactivateCashAccountCommand | ReactivateCashAccountCommand, CashAccountDto>({
    commandType: targetActive ? "ReactivateCashAccount" : "DeactivateCashAccount",
    schema,
    input,
    ctx,
    requiredPermission: "cash.account.manage",
    requiredWorkflows: ["cashbook"],
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.cashAccounts.findByIdForUpdate(
        command.workspaceId,
        command.payload.cashAccountId,
      );
      if (current === null) return err("CASH_ACCOUNT_NOT_FOUND", "No such cash account.");
      const decision = decideCashAccountLifecycle(command, current, targetActive, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.cashAccounts.update(decision.value.account, current.version))) {
        return err("CASH_ACCOUNT_VERSION_CONFLICT", "Cash account changed concurrently.");
      }
      await audit(repos, command, decision.value.audit as never);
      return ok(decision.value.account);
    },
  });
}

export const deactivateCashAccount = (ctx: CommandContext, input: unknown) =>
  cashAccountLifecycle(ctx, input, false);
export const reactivateCashAccount = (ctx: CommandContext, input: unknown) =>
  cashAccountLifecycle(ctx, input, true);

export function recordExpense(ctx: CommandContext, input: unknown) {
  return runCommand<RecordExpenseCommand, ExpenseDto>({
    commandType: "RecordExpense",
    schema: recordExpenseCommandSchema,
    input,
    ctx,
    requiredPermission: "cash.expense.record",
    requiredWorkflows: ["cashbook"],
    execute: async ({ command, repos, recordedAt }) => {
      const account = await repos.cashAccounts.findByIdForUpdate(
        command.workspaceId,
        command.payload.cashAccountId,
      );
      if (account === null) return err("CASH_ACCOUNT_NOT_FOUND", "No such cash account.");
      const decision = decideRecordExpense(command, account, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.expenses.insert(decision.value.expense))) {
        return err("CASH_RECONCILIATION_INTEGRITY_FAILURE", "Expense identity already exists.");
      }
      await applyCashMovements(repos, [
        {
          workspaceId: command.workspaceId,
          cashAccountId: account.id,
          amount: {
            amountMinor: decision.value.movementAmountMinor,
            currency: account.currency,
          },
          sourceType: "expense",
          sourceId: decision.value.expense.id,
          reversalOfMovementId: null,
          note: decision.value.expense.note,
          transactionTime: command.occurredAt,
          recordedAt,
          actorId: command.actorId,
          commandId: command.commandId,
        },
      ]);
      await audit(repos, command, decision.value.audit as never);
      return ok(decision.value.expense);
    },
  });
}

export function reverseExpense(ctx: CommandContext, input: unknown) {
  return runCommand<ReverseExpenseCommand, ExpenseDto>({
    commandType: "ReverseExpense",
    schema: reverseExpenseCommandSchema,
    input,
    ctx,
    requiredPermission: "cash.expense.reverse",
    execute: async ({ command, repos, recordedAt }) => {
      const expense = await repos.expenses.findByIdForUpdate(
        command.workspaceId,
        command.payload.expenseId,
      );
      if (expense === null) return err("EXPENSE_NOT_FOUND", "No such expense.");
      const original = await repos.cashMovements.findBySource(
        command.workspaceId,
        "expense",
        expense.id,
        expense.cashAccountId,
      );
      if (original === null) {
        throw new Error(`Expense ${expense.id} has no canonical cash movement.`);
      }
      const decision = decideReverseExpense(command, expense, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.expenses.insertReversal(decision.value.expense))) {
        return err("EXPENSE_ALREADY_REVERSED", "Expense is already reversed.");
      }
      await applyCashMovements(repos, [
        {
          workspaceId: command.workspaceId,
          cashAccountId: expense.cashAccountId,
          amount: {
            amountMinor: decision.value.movementAmountMinor,
            currency: expense.amount.currency,
          },
          sourceType: "expense_reversal",
          sourceId: command.payload.reversalId,
          reversalOfMovementId: original.id,
          note: command.payload.reason.trim(),
          transactionTime: command.occurredAt,
          recordedAt,
          actorId: command.actorId,
          commandId: command.commandId,
        },
      ]);
      await audit(repos, command, decision.value.audit as never);
      return ok(decision.value.expense);
    },
  });
}

export function recordCashTransfer(ctx: CommandContext, input: unknown) {
  return runCommand<RecordCashTransferCommand, CashTransferDto>({
    commandType: "RecordCashTransfer",
    schema: recordCashTransferCommandSchema,
    input,
    ctx,
    requiredPermission: "cash.transfer",
    requiredWorkflows: ["cashbook"],
    execute: async ({ command, repos, recordedAt }) => {
      const [from, to] = await Promise.all([
        repos.cashAccounts.findByIdForUpdate(command.workspaceId, command.payload.fromCashAccountId),
        repos.cashAccounts.findByIdForUpdate(command.workspaceId, command.payload.toCashAccountId),
      ]);
      if (from === null || to === null) return err("CASH_ACCOUNT_NOT_FOUND", "Transfer account is missing.");
      const decision = decideRecordCashTransfer(command, from, to, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.cashTransfers.insert(decision.value.transfer))) {
        return err("CASH_RECONCILIATION_INTEGRITY_FAILURE", "Transfer identity already exists.");
      }
      await applyCashMovements(repos, [
        {
          workspaceId: command.workspaceId,
          cashAccountId: from.id,
          amount: { amountMinor: -command.payload.amount.amountMinor, currency: from.currency },
          sourceType: "cash_transfer_out",
          sourceId: command.payload.transferId,
          reversalOfMovementId: null,
          note: command.payload.note,
          transactionTime: command.occurredAt,
          recordedAt,
          actorId: command.actorId,
          commandId: command.commandId,
        },
        {
          workspaceId: command.workspaceId,
          cashAccountId: to.id,
          amount: command.payload.amount,
          sourceType: "cash_transfer_in",
          sourceId: command.payload.transferId,
          reversalOfMovementId: null,
          note: command.payload.note,
          transactionTime: command.occurredAt,
          recordedAt,
          actorId: command.actorId,
          commandId: command.commandId,
        },
      ]);
      await audit(repos, command, decision.value.audit as never);
      return ok(decision.value.transfer);
    },
  });
}

export function reverseCashTransfer(ctx: CommandContext, input: unknown) {
  return runCommand<ReverseCashTransferCommand, CashTransferDto>({
    commandType: "ReverseCashTransfer",
    schema: reverseCashTransferCommandSchema,
    input,
    ctx,
    requiredPermission: "cash.transfer",
    execute: async ({ command, repos, recordedAt }) => {
      const transfer = await repos.cashTransfers.findByIdForUpdate(
        command.workspaceId,
        command.payload.transferId,
      );
      if (transfer === null) return err("CASH_TRANSFER_NOT_FOUND", "No such transfer.");
      const [fromOriginal, toOriginal] = await Promise.all([
        repos.cashMovements.findBySource(
          command.workspaceId,
          "cash_transfer_out",
          transfer.id,
          transfer.fromCashAccountId,
        ),
        repos.cashMovements.findBySource(
          command.workspaceId,
          "cash_transfer_in",
          transfer.id,
          transfer.toCashAccountId,
        ),
      ]);
      if (fromOriginal === null || toOriginal === null) {
        throw new Error(`Cash transfer ${transfer.id} has incomplete canonical movements.`);
      }
      const decision = decideReverseCashTransfer(command, transfer, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.cashTransfers.insertReversal(decision.value.transfer))) {
        return err("CASH_TRANSFER_ALREADY_REVERSED", "Cash transfer is already reversed.");
      }
      await applyCashMovements(repos, [
        {
          workspaceId: command.workspaceId,
          cashAccountId: transfer.fromCashAccountId,
          amount: transfer.amount,
          sourceType: "cash_transfer_reversal_out",
          sourceId: command.payload.reversalId,
          reversalOfMovementId: fromOriginal.id,
          note: command.payload.reason.trim(),
          transactionTime: command.occurredAt,
          recordedAt,
          actorId: command.actorId,
          commandId: command.commandId,
        },
        {
          workspaceId: command.workspaceId,
          cashAccountId: transfer.toCashAccountId,
          amount: { amountMinor: -transfer.amount.amountMinor, currency: transfer.amount.currency },
          sourceType: "cash_transfer_reversal_in",
          sourceId: command.payload.reversalId,
          reversalOfMovementId: toOriginal.id,
          note: command.payload.reason.trim(),
          transactionTime: command.occurredAt,
          recordedAt,
          actorId: command.actorId,
          commandId: command.commandId,
        },
      ]);
      await audit(repos, command, decision.value.audit as never);
      return ok(decision.value.transfer);
    },
  });
}

export function adjustCash(ctx: CommandContext, input: unknown) {
  return runCommand<AdjustCashCommand, { adjustmentId: string }>({
    commandType: "AdjustCash",
    schema: adjustCashCommandSchema,
    input,
    ctx,
    requiredPermission: "cash.adjust",
    requiredWorkflows: ["cashbook"],
    execute: async ({ command, repos, recordedAt }) => {
      const account = await repos.cashAccounts.findByIdForUpdate(
        command.workspaceId,
        command.payload.cashAccountId,
      );
      if (account === null) return err("CASH_ACCOUNT_NOT_FOUND", "No such cash account.");
      const decision = decideAdjustCash(command, account, recordedAt);
      if (!decision.ok) return decision;
      const amount = {
        amountMinor: decision.value.movementAmountMinor,
        currency: account.currency,
      };
      if (!(await repos.cashAdjustments.insert({
        id: command.payload.adjustmentId,
        workspaceId: command.workspaceId,
        cashAccountId: account.id,
        amount,
        reasonCode: command.payload.reasonCode,
        reason: command.payload.reason.trim(),
        transactionTime: command.occurredAt,
        recordedAt,
        actorId: command.actorId,
        commandId: command.commandId,
      }))) {
        return err("CASH_RECONCILIATION_INTEGRITY_FAILURE", "Cash adjustment identity already exists.");
      }
      await applyCashMovements(repos, [
        {
          workspaceId: command.workspaceId,
          cashAccountId: account.id,
          amount,
          sourceType: "cash_adjustment",
          sourceId: command.payload.adjustmentId,
          reversalOfMovementId: null,
          note: command.payload.reason.trim(),
          transactionTime: command.occurredAt,
          recordedAt,
          actorId: command.actorId,
          commandId: command.commandId,
        },
      ]);
      await audit(repos, command, decision.value.audit as never);
      return ok({ adjustmentId: command.payload.adjustmentId });
    },
  });
}

export function rebuildCashBalance(ctx: CommandContext, input: unknown) {
  return runCommand<RebuildCashBalanceCommand, CashBalanceDto>({
    commandType: "RebuildCashBalance",
    schema: rebuildCashBalanceCommandSchema,
    input,
    ctx,
    requiredPermission: "cash.rebuild",
    execute: async ({ command, repos, recordedAt }) => {
      const reconciliation = await repos.cashReads.reconciliation(
        command.workspaceId,
        command.payload.cashAccountId,
      );
      if (reconciliation.status === "not_found") {
        return err("CASH_ACCOUNT_NOT_FOUND", "No such cash account.");
      }
      if (reconciliation.status === "integrity_failure" || reconciliation.canonical === null) {
        return err(
          "CASH_RECONCILIATION_REBUILD_UNSAFE",
          "Canonical cash movements are not safe to rebuild.",
          { diagnostics: reconciliation.diagnostics },
        );
      }
      await repos.cashBalances.save({ ...reconciliation.canonical, updatedAt: recordedAt });
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "cash",
        aggregateId: command.payload.cashAccountId,
        action: "cash.projection_rebuilt",
        transactionTime: command.occurredAt,
        recordedAt,
        before: reconciliation.projected,
        after: reconciliation.canonical,
        reason: null,
      });
      return ok({ ...reconciliation.canonical, updatedAt: recordedAt });
    },
  });
}
