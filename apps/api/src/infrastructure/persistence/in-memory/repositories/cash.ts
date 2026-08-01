import type { CashMovementDto } from "@vuarau/domain-contracts";
import type { Repositories } from "../../ports.ts";
import type { IdGenerator } from "../../../clock.ts";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

export const createCashRepositories = (
  store: Store,
  ids: IdGenerator,
): Pick<
  Repositories,
  | "cashAccounts"
  | "expenses"
  | "cashTransfers"
  | "cashAdjustments"
  | "cashMovements"
  | "cashBalances"
> => ({
  cashAccounts: {
    findById: async (workspaceId, cashAccountId) =>
      store.cashAccounts.get(key(workspaceId, cashAccountId)) ?? null,
    findByIdForUpdate: async (workspaceId, cashAccountId) =>
      store.cashAccounts.get(key(workspaceId, cashAccountId)) ?? null,
    insert: async (account) => {
      const accountKey = key(account.workspaceId, account.id);
      if (store.cashAccounts.has(accountKey)) return false;
      store.cashAccounts.set(accountKey, account);
      store.cashBalances.set(accountKey, {
        workspaceId: account.workspaceId,
        cashAccountId: account.id,
        balance: { amountMinor: 0, currency: account.currency },
        movementCount: 0,
        lastMovementTransactionTime: null,
        updatedAt: account.createdAt,
      });
      return true;
    },
    update: async (account, expectedVersion) => {
      const accountKey = key(account.workspaceId, account.id);
      const current = store.cashAccounts.get(accountKey);
      if (current === undefined || current.version !== expectedVersion) return false;
      store.cashAccounts.set(accountKey, account);
      return true;
    },
  },
  expenses: {
    findById: async (workspaceId, expenseId) =>
      store.expenses.get(key(workspaceId, expenseId)) ?? null,
    findByIdForUpdate: async (workspaceId, expenseId) =>
      store.expenses.get(key(workspaceId, expenseId)) ?? null,
    insert: async (expense) => {
      const expenseKey = key(expense.workspaceId, expense.id);
      if (store.expenses.has(expenseKey)) return false;
      store.expenses.set(expenseKey, expense);
      return true;
    },
    insertReversal: async (expense) => {
      const expenseKey = key(expense.workspaceId, expense.id);
      const current = store.expenses.get(expenseKey);
      if (current === undefined || current.reversal !== null || expense.reversal === null) return false;
      store.expenses.set(expenseKey, expense);
      return true;
    },
  },
  cashTransfers: {
    findById: async (workspaceId, transferId) =>
      store.cashTransfers.get(key(workspaceId, transferId)) ?? null,
    findByIdForUpdate: async (workspaceId, transferId) =>
      store.cashTransfers.get(key(workspaceId, transferId)) ?? null,
    insert: async (transfer) => {
      const transferKey = key(transfer.workspaceId, transfer.id);
      if (store.cashTransfers.has(transferKey)) return false;
      store.cashTransfers.set(transferKey, transfer);
      return true;
    },
    insertReversal: async (transfer) => {
      const transferKey = key(transfer.workspaceId, transfer.id);
      const current = store.cashTransfers.get(transferKey);
      if (current === undefined || current.reversal !== null || transfer.reversal === null) return false;
      store.cashTransfers.set(transferKey, transfer);
      return true;
    },
  },
  cashAdjustments: {
    insert: async (adjustment) => {
      if (
        store.cashAdjustments.some(
          (current) =>
            current.workspaceId === adjustment.workspaceId && current.id === adjustment.id,
        )
      )
        return false;
      store.cashAdjustments.push({ ...adjustment });
      return true;
    },
  },
  cashMovements: {
    append: async (movements) => {
      const appended: CashMovementDto[] = [];
      for (const movement of movements) {
        const duplicate = store.cashMovements.some(
          (current) =>
            current.workspaceId === movement.workspaceId &&
            current.cashAccountId === movement.cashAccountId &&
            current.sourceType === movement.sourceType &&
            current.sourceId === movement.sourceId,
        );
        if (duplicate) continue;
        appended.push({
          ...movement,
          id: ids.newId() as CashMovementDto["id"],
        });
      }
      store.cashMovements.push(...appended);
      return appended;
    },
    listByAccount: async (workspaceId, cashAccountId) =>
      store.cashMovements
        .filter(
          (movement) =>
            movement.workspaceId === workspaceId && movement.cashAccountId === cashAccountId,
        )
        .sort((left, right) =>
          left.transactionTime !== right.transactionTime
            ? left.transactionTime.localeCompare(right.transactionTime)
            : left.recordedAt !== right.recordedAt
              ? left.recordedAt.localeCompare(right.recordedAt)
              : left.id.localeCompare(right.id),
        ),
    findBySource: async (workspaceId, sourceType, sourceId, cashAccountId) =>
      store.cashMovements.find(
        (movement) =>
          movement.workspaceId === workspaceId &&
          movement.cashAccountId === cashAccountId &&
          movement.sourceType === sourceType &&
          movement.sourceId === sourceId,
      ) ?? null,
  },
  cashBalances: {
    get: async (workspaceId, cashAccountId) =>
      store.cashBalances.get(key(workspaceId, cashAccountId)) ?? null,
    applyDelta: async (delta) => {
      const balanceKey = key(delta.workspaceId, delta.cashAccountId);
      const current = store.cashBalances.get(balanceKey);
      store.cashBalances.set(balanceKey, {
        workspaceId: delta.workspaceId,
        cashAccountId: delta.cashAccountId,
        balance: {
          amountMinor: (current?.balance.amountMinor ?? 0) + delta.amount.amountMinor,
          currency: delta.amount.currency,
        },
        movementCount: (current?.movementCount ?? 0) + delta.movementCount,
        lastMovementTransactionTime:
          current?.lastMovementTransactionTime !== null &&
          current?.lastMovementTransactionTime !== undefined &&
          current.lastMovementTransactionTime > delta.lastMovementTransactionTime
            ? current.lastMovementTransactionTime
            : delta.lastMovementTransactionTime,
        updatedAt:
          current !== undefined && current.updatedAt > delta.updatedAt
            ? current.updatedAt
            : delta.updatedAt,
      });
    },
    save: async (balance) => {
      store.cashBalances.set(key(balance.workspaceId, balance.cashAccountId), balance);
    },
  },
});
