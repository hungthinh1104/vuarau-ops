import { and, asc, eq, sql } from "drizzle-orm";
import type {
  CashAccountDto,
  CashAccountId,
  CashBalanceDto,
  CashMovementDto,
  CashMovementSourceType,
  CashTransferDto,
  CashTransferId,
  ExpenseDto,
  ExpenseId,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import type { CashMovementDraft } from "@vuarau/domain-kernel";
import {
  cashAccounts,
  cashAdjustments,
  cashBalances,
  cashMovements,
  cashTransfers,
  cashTransferReversals,
  expenses,
  expenseReversals,
} from "../../schema/index.ts";
import { fromIso, fromIsoOrNull, toIso, toIsoOrNull } from "../row-mappers.ts";
import type { IdMinter, Tx } from "../shared/types.ts";

const accountDto = (row: typeof cashAccounts.$inferSelect): CashAccountDto => ({
  id: row.id as CashAccountDto["id"],
  workspaceId: row.workspaceId as WorkspaceId,
  displayName: row.displayName,
  kind: row.kind,
  currency: row.currency,
  custodianActorId: row.custodianActorId as CashAccountDto["custodianActorId"],
  note: row.note,
  isActive: row.isActive,
  version: row.version,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

const movementDto = (row: typeof cashMovements.$inferSelect): CashMovementDto => ({
  id: row.id as CashMovementDto["id"],
  workspaceId: row.workspaceId as WorkspaceId,
  cashAccountId: row.cashAccountId as CashAccountId,
  amount: { amountMinor: row.amountMinor, currency: row.currency },
  sourceType: row.sourceType,
  sourceId: row.sourceId,
  reversalOfMovementId: row.reversalOfMovementId as CashMovementDto["reversalOfMovementId"],
  note: row.note,
  transactionTime: toIso(row.transactionTime),
  recordedAt: toIso(row.recordedAt),
  actorId: row.actorId as CashMovementDto["actorId"],
  commandId: row.commandId as CashMovementDto["commandId"],
});

async function expenseDto(
  tx: Tx,
  workspaceId: WorkspaceId,
  expenseId: ExpenseId,
  lock = false,
): Promise<ExpenseDto | null> {
  let query = tx
    .select()
    .from(expenses)
    .where(and(eq(expenses.workspaceId, workspaceId), eq(expenses.id, expenseId)))
    .limit(1);
  if (lock) query = query.for("update") as typeof query;
  const row = (await query)[0];
  if (row === undefined) return null;
  const reversal = (
    await tx
      .select()
      .from(expenseReversals)
      .where(
        and(
          eq(expenseReversals.workspaceId, workspaceId),
          eq(expenseReversals.expenseId, expenseId),
        ),
      )
      .limit(1)
  )[0];
  return {
    id: row.id as ExpenseDto["id"],
    workspaceId: row.workspaceId as WorkspaceId,
    cashAccountId: row.cashAccountId as CashAccountId,
    category: row.category,
    amount: { amountMinor: row.amountMinor, currency: row.currency },
    payee: row.payee,
    note: row.note,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId as ExpenseDto["actorId"],
    commandId: row.commandId as ExpenseDto["commandId"],
    reversal:
      reversal === undefined
        ? null
        : {
            id: reversal.id as NonNullable<ExpenseDto["reversal"]>["id"],
            reason: reversal.reason,
            transactionTime: toIso(reversal.transactionTime),
            recordedAt: toIso(reversal.recordedAt),
            actorId: reversal.actorId as ExpenseDto["actorId"],
            commandId: reversal.commandId as NonNullable<ExpenseDto["reversal"]>["commandId"],
          },
  };
}

async function transferDto(
  tx: Tx,
  workspaceId: WorkspaceId,
  transferId: CashTransferId,
  lock = false,
): Promise<CashTransferDto | null> {
  let query = tx
    .select()
    .from(cashTransfers)
    .where(and(eq(cashTransfers.workspaceId, workspaceId), eq(cashTransfers.id, transferId)))
    .limit(1);
  if (lock) query = query.for("update") as typeof query;
  const row = (await query)[0];
  if (row === undefined) return null;
  const reversal = (
    await tx
      .select()
      .from(cashTransferReversals)
      .where(
        and(
          eq(cashTransferReversals.workspaceId, workspaceId),
          eq(cashTransferReversals.transferId, transferId),
        ),
      )
      .limit(1)
  )[0];
  return {
    id: row.id as CashTransferDto["id"],
    workspaceId: row.workspaceId as WorkspaceId,
    fromCashAccountId: row.fromCashAccountId as CashAccountId,
    toCashAccountId: row.toCashAccountId as CashAccountId,
    amount: { amountMinor: row.amountMinor, currency: row.currency },
    note: row.note,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId as CashTransferDto["actorId"],
    commandId: row.commandId as CashTransferDto["commandId"],
    reversal:
      reversal === undefined
        ? null
        : {
            id: reversal.id as NonNullable<CashTransferDto["reversal"]>["id"],
            reason: reversal.reason,
            transactionTime: toIso(reversal.transactionTime),
            recordedAt: toIso(reversal.recordedAt),
            actorId: reversal.actorId as CashTransferDto["actorId"],
            commandId: reversal.commandId as NonNullable<CashTransferDto["reversal"]>["commandId"],
          },
  };
}

export const createCashWriteRepositories = (tx: Tx, ids: IdMinter) => ({
  cashAccounts: {
    async findById(workspaceId: WorkspaceId, cashAccountId: CashAccountId) {
      const row = (
        await tx
          .select()
          .from(cashAccounts)
          .where(and(eq(cashAccounts.workspaceId, workspaceId), eq(cashAccounts.id, cashAccountId)))
          .limit(1)
      )[0];
      return row === undefined ? null : accountDto(row);
    },
    async findByIdForUpdate(workspaceId: WorkspaceId, cashAccountId: CashAccountId) {
      const row = (
        await tx
          .select()
          .from(cashAccounts)
          .where(and(eq(cashAccounts.workspaceId, workspaceId), eq(cashAccounts.id, cashAccountId)))
          .limit(1)
          .for("update")
      )[0];
      return row === undefined ? null : accountDto(row);
    },
    async insert(account: CashAccountDto) {
      const rows = await tx
        .insert(cashAccounts)
        .values({
          id: account.id,
          workspaceId: account.workspaceId,
          displayName: account.displayName,
          kind: account.kind,
          currency: account.currency,
          custodianActorId: account.custodianActorId,
          note: account.note,
          isActive: account.isActive,
          version: account.version,
          createdAt: fromIso(account.createdAt),
          updatedAt: fromIso(account.updatedAt),
        })
        .onConflictDoNothing()
        .returning({ id: cashAccounts.id });
      if (rows.length === 1) {
        await tx.insert(cashBalances).values({
          workspaceId: account.workspaceId,
          cashAccountId: account.id,
          balanceMinor: 0,
          currency: account.currency,
          movementCount: 0,
          lastMovementTransactionTime: null,
          updatedAt: fromIso(account.createdAt),
        });
      }
      return rows.length === 1;
    },
    async update(account: CashAccountDto, expectedVersion: number) {
      const rows = await tx
        .update(cashAccounts)
        .set({
          displayName: account.displayName,
          kind: account.kind,
          custodianActorId: account.custodianActorId,
          note: account.note,
          isActive: account.isActive,
          version: account.version,
          updatedAt: fromIso(account.updatedAt),
        })
        .where(
          and(
            eq(cashAccounts.workspaceId, account.workspaceId),
            eq(cashAccounts.id, account.id),
            eq(cashAccounts.version, expectedVersion),
          ),
        )
        .returning({ id: cashAccounts.id });
      return rows.length === 1;
    },
  },
  expenses: {
    findById: (workspaceId: WorkspaceId, expenseId: ExpenseId) =>
      expenseDto(tx, workspaceId, expenseId),
    findByIdForUpdate: (workspaceId: WorkspaceId, expenseId: ExpenseId) =>
      expenseDto(tx, workspaceId, expenseId, true),
    async insert(expense: ExpenseDto) {
      const rows = await tx
        .insert(expenses)
        .values({
          id: expense.id,
          workspaceId: expense.workspaceId,
          cashAccountId: expense.cashAccountId,
          category: expense.category,
          amountMinor: expense.amount.amountMinor,
          currency: expense.amount.currency,
          payee: expense.payee,
          note: expense.note,
          transactionTime: fromIso(expense.transactionTime),
          recordedAt: fromIso(expense.recordedAt),
          actorId: expense.actorId,
          commandId: expense.commandId,
        })
        .onConflictDoNothing()
        .returning({ id: expenses.id });
      return rows.length === 1;
    },
    async insertReversal(expense: ExpenseDto) {
      if (expense.reversal === null) return false;
      const rows = await tx
        .insert(expenseReversals)
        .values({
          id: expense.reversal.id,
          workspaceId: expense.workspaceId,
          expenseId: expense.id,
          reason: expense.reversal.reason,
          transactionTime: fromIso(expense.reversal.transactionTime),
          recordedAt: fromIso(expense.reversal.recordedAt),
          actorId: expense.reversal.actorId,
          commandId: expense.reversal.commandId,
        })
        .onConflictDoNothing()
        .returning({ id: expenseReversals.id });
      return rows.length === 1;
    },
  },
  cashTransfers: {
    findById: (workspaceId: WorkspaceId, transferId: CashTransferId) =>
      transferDto(tx, workspaceId, transferId),
    findByIdForUpdate: (workspaceId: WorkspaceId, transferId: CashTransferId) =>
      transferDto(tx, workspaceId, transferId, true),
    async insert(transfer: CashTransferDto) {
      const rows = await tx
        .insert(cashTransfers)
        .values({
          id: transfer.id,
          workspaceId: transfer.workspaceId,
          fromCashAccountId: transfer.fromCashAccountId,
          toCashAccountId: transfer.toCashAccountId,
          amountMinor: transfer.amount.amountMinor,
          currency: transfer.amount.currency,
          note: transfer.note,
          transactionTime: fromIso(transfer.transactionTime),
          recordedAt: fromIso(transfer.recordedAt),
          actorId: transfer.actorId,
          commandId: transfer.commandId,
        })
        .onConflictDoNothing()
        .returning({ id: cashTransfers.id });
      return rows.length === 1;
    },
    async insertReversal(transfer: CashTransferDto) {
      if (transfer.reversal === null) return false;
      const rows = await tx
        .insert(cashTransferReversals)
        .values({
          id: transfer.reversal.id,
          workspaceId: transfer.workspaceId,
          transferId: transfer.id,
          reason: transfer.reversal.reason,
          transactionTime: fromIso(transfer.reversal.transactionTime),
          recordedAt: fromIso(transfer.reversal.recordedAt),
          actorId: transfer.reversal.actorId,
          commandId: transfer.reversal.commandId,
        })
        .onConflictDoNothing()
        .returning({ id: cashTransferReversals.id });
      return rows.length === 1;
    },
  },
  cashAdjustments: {
    async insert(adjustment: {
      id: string;
      workspaceId: WorkspaceId;
      cashAccountId: CashAccountId;
      amount: CashMovementDto["amount"];
      reasonCode: string;
      reason: string;
      transactionTime: CashMovementDto["transactionTime"];
      recordedAt: CashMovementDto["recordedAt"];
      actorId: CashMovementDto["actorId"];
      commandId: CashMovementDto["commandId"];
    }) {
      const rows = await tx
        .insert(cashAdjustments)
        .values({
          id: adjustment.id,
          workspaceId: adjustment.workspaceId,
          cashAccountId: adjustment.cashAccountId,
          amountMinor: adjustment.amount.amountMinor,
          currency: adjustment.amount.currency,
          reasonCode: adjustment.reasonCode as typeof cashAdjustments.$inferInsert.reasonCode,
          reason: adjustment.reason,
          transactionTime: fromIso(adjustment.transactionTime),
          recordedAt: fromIso(adjustment.recordedAt),
          actorId: adjustment.actorId,
          commandId: adjustment.commandId,
        })
        .onConflictDoNothing()
        .returning({ id: cashAdjustments.id });
      return rows.length === 1;
    },
  },
  cashMovements: {
    async append(movements: readonly CashMovementDraft[]) {
      if (movements.length === 0) return [];
      const rows = await tx
        .insert(cashMovements)
        .values(
          movements.map((movement) => ({
            id: ids.newId(),
            workspaceId: movement.workspaceId,
            cashAccountId: movement.cashAccountId,
            amountMinor: movement.amount.amountMinor,
            currency: movement.amount.currency,
            sourceType: movement.sourceType,
            sourceId: movement.sourceId,
            reversalOfMovementId: movement.reversalOfMovementId,
            note: movement.note,
            transactionTime: fromIso(movement.transactionTime),
            recordedAt: fromIso(movement.recordedAt),
            actorId: movement.actorId,
            commandId: movement.commandId,
          })),
        )
        .onConflictDoNothing()
        .returning();
      return rows.map(movementDto);
    },
    async listByAccount(workspaceId: WorkspaceId, cashAccountId: CashAccountId) {
      const rows = await tx
        .select()
        .from(cashMovements)
        .where(
          and(
            eq(cashMovements.workspaceId, workspaceId),
            eq(cashMovements.cashAccountId, cashAccountId),
          ),
        )
        .orderBy(
          asc(cashMovements.transactionTime),
          asc(cashMovements.recordedAt),
          asc(cashMovements.id),
        );
      return rows.map(movementDto);
    },
    async findBySource(
      workspaceId: WorkspaceId,
      sourceType: CashMovementSourceType,
      sourceId: string,
      cashAccountId: CashAccountId,
    ) {
      const row = (
        await tx
          .select()
          .from(cashMovements)
          .where(
            and(
              eq(cashMovements.workspaceId, workspaceId),
              eq(cashMovements.sourceType, sourceType),
              eq(cashMovements.sourceId, sourceId),
              eq(cashMovements.cashAccountId, cashAccountId),
            ),
          )
          .limit(1)
      )[0];
      return row === undefined ? null : movementDto(row);
    },
  },
  cashBalances: {
    async get(workspaceId: WorkspaceId, cashAccountId: CashAccountId) {
      const row = (
        await tx
          .select()
          .from(cashBalances)
          .where(
            and(
              eq(cashBalances.workspaceId, workspaceId),
              eq(cashBalances.cashAccountId, cashAccountId),
            ),
          )
          .limit(1)
      )[0];
      return row === undefined
        ? null
        : {
            workspaceId: row.workspaceId as WorkspaceId,
            cashAccountId: row.cashAccountId as CashAccountId,
            balance: { amountMinor: row.balanceMinor, currency: row.currency },
            movementCount: row.movementCount,
            lastMovementTransactionTime: toIsoOrNull(row.lastMovementTransactionTime),
            updatedAt: toIso(row.updatedAt),
          };
    },
    async applyDelta(delta: {
      workspaceId: WorkspaceId;
      cashAccountId: CashAccountId;
      amount: CashMovementDto["amount"];
      movementCount: number;
      lastMovementTransactionTime: CashMovementDto["transactionTime"];
      updatedAt: CashMovementDto["recordedAt"];
    }) {
      await tx
        .insert(cashBalances)
        .values({
          workspaceId: delta.workspaceId,
          cashAccountId: delta.cashAccountId,
          balanceMinor: delta.amount.amountMinor,
          currency: delta.amount.currency,
          movementCount: delta.movementCount,
          lastMovementTransactionTime: fromIso(delta.lastMovementTransactionTime),
          updatedAt: fromIso(delta.updatedAt),
        })
        .onConflictDoUpdate({
          target: [cashBalances.workspaceId, cashBalances.cashAccountId],
          set: {
            balanceMinor: sql`${cashBalances.balanceMinor} + excluded.balance_minor`,
            currency: sql`excluded.currency`,
            movementCount: sql`${cashBalances.movementCount} + excluded.movement_count`,
            lastMovementTransactionTime: sql`greatest(coalesce(${cashBalances.lastMovementTransactionTime}, excluded.last_movement_transaction_time), excluded.last_movement_transaction_time)`,
            updatedAt: sql`greatest(${cashBalances.updatedAt}, excluded.updated_at)`,
          },
        });
    },
    async save(balance: CashBalanceDto) {
      await tx
        .insert(cashBalances)
        .values({
          workspaceId: balance.workspaceId,
          cashAccountId: balance.cashAccountId,
          balanceMinor: balance.balance.amountMinor,
          currency: balance.balance.currency,
          movementCount: balance.movementCount,
          lastMovementTransactionTime: fromIsoOrNull(balance.lastMovementTransactionTime),
          updatedAt: fromIso(balance.updatedAt),
        })
        .onConflictDoUpdate({
          target: [cashBalances.workspaceId, cashBalances.cashAccountId],
          set: {
            balanceMinor: balance.balance.amountMinor,
            currency: balance.balance.currency,
            movementCount: balance.movementCount,
            lastMovementTransactionTime: fromIsoOrNull(balance.lastMovementTransactionTime),
            updatedAt: fromIso(balance.updatedAt),
          },
        });
    },
  },
});
