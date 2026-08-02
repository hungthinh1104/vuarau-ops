import type {
  CashAccountGetInput,
  CashAccountSearchInput,
  CashReconciliationInput,
  CashTimelineInput,
  CashTransferGetInput,
  ExpenseGetInput,
} from "@vuarau/domain-contracts";
import { err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";

export const searchCashAccounts = (ctx: CommandContext, input: CashAccountSearchInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "cash.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.cashReads.searchAccounts({
          workspaceId: input.workspaceId,
          query: input.query,
          isActive: input.isActive,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  });

export async function getCashAccount(ctx: CommandContext, input: CashAccountGetInput) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "cash.read",
    execute: ({ repos }) => repos.cashReads.account(input.workspaceId, input.cashAccountId),
  });
  if (!result.ok) return result;
  return result.value === null
    ? err("CASH_ACCOUNT_NOT_FOUND", "No such cash account.")
    : ok(result.value);
}

export const getCashTimeline = (ctx: CommandContext, input: CashTimelineInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "cash.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.cashReads.timeline({
          workspaceId: input.workspaceId,
          cashAccountId: input.cashAccountId,
          from: input.from,
          to: input.to,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  });

export async function getExpense(ctx: CommandContext, input: ExpenseGetInput) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "cash.read",
    execute: ({ repos }) => repos.cashReads.expense(input.workspaceId, input.expenseId),
  });
  if (!result.ok) return result;
  return result.value === null ? err("EXPENSE_NOT_FOUND", "No such expense.") : ok(result.value);
}

export async function getCashTransfer(ctx: CommandContext, input: CashTransferGetInput) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "cash.read",
    execute: ({ repos }) => repos.cashReads.transfer(input.workspaceId, input.transferId),
  });
  if (!result.ok) return result;
  return result.value === null
    ? err("CASH_TRANSFER_NOT_FOUND", "No such cash transfer.")
    : ok(result.value);
}

export const getCashReconciliation = (ctx: CommandContext, input: CashReconciliationInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "cash.read",
    execute: ({ repos }) => repos.cashReads.reconciliation(input.workspaceId, input.cashAccountId),
  });
