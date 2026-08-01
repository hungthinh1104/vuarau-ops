import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type {
  CashAccountId,
  CashAccountDto,
  CashBalanceDto,
  CashMovementDto,
  CashReconciliationDto,
  CashTransferDto,
  CashTransferId,
  ExpenseDto,
  ExpenseId,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import {
  cashAccounts,
  cashBalances,
  cashMovements,
  cashTransfers,
  cashTransferReversals,
  expenses,
  expenseReversals,
} from "../../schema/index.ts";
import { toIso, toIsoOrNull } from "../row-mappers.ts";
import type { Page } from "../shared/read-helpers.ts";
import { fetchLimit, paged } from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";

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

const balanceDto = (
  row: typeof cashBalances.$inferSelect | null,
  account: CashAccountDto,
): CashBalanceDto =>
  row === null
    ? {
        workspaceId: account.workspaceId,
        cashAccountId: account.id,
        balance: { amountMinor: 0, currency: account.currency },
        movementCount: 0,
        lastMovementTransactionTime: null,
        updatedAt: account.createdAt,
      }
    : {
        workspaceId: row.workspaceId as WorkspaceId,
        cashAccountId: row.cashAccountId as CashAccountId,
        balance: { amountMinor: row.balanceMinor, currency: row.currency },
        movementCount: row.movementCount,
        lastMovementTransactionTime: toIsoOrNull(row.lastMovementTransactionTime),
        updatedAt: toIso(row.updatedAt),
      };

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

async function readExpense(
  tx: Tx,
  workspaceId: WorkspaceId,
  expenseId: ExpenseId,
): Promise<ExpenseDto | null> {
  const row = (
    await tx
      .select()
      .from(expenses)
      .where(and(eq(expenses.workspaceId, workspaceId), eq(expenses.id, expenseId)))
      .limit(1)
  )[0];
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
            actorId: reversal.actorId as NonNullable<ExpenseDto["reversal"]>["actorId"],
            commandId: reversal.commandId as NonNullable<ExpenseDto["reversal"]>["commandId"],
          },
  };
}

async function readTransfer(
  tx: Tx,
  workspaceId: WorkspaceId,
  transferId: CashTransferId,
): Promise<CashTransferDto | null> {
  const row = (
    await tx
      .select()
      .from(cashTransfers)
      .where(and(eq(cashTransfers.workspaceId, workspaceId), eq(cashTransfers.id, transferId)))
      .limit(1)
  )[0];
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
            actorId: reversal.actorId as NonNullable<CashTransferDto["reversal"]>["actorId"],
            commandId: reversal.commandId as NonNullable<CashTransferDto["reversal"]>["commandId"],
          },
  };
}

export const createCashReadRepositories = (tx: Tx) => ({
  cashReads: {
    async searchAccounts(args: {
      workspaceId: WorkspaceId;
      query: string;
      isActive: boolean | null;
      page: Page;
    }) {
      const filters: SQL[] = [eq(cashAccounts.workspaceId, args.workspaceId)];
      if (args.isActive !== null) filters.push(eq(cashAccounts.isActive, args.isActive));
      if (args.query.length > 0) {
        const pattern = `%${args.query}%`;
        filters.push(sql`vuarau_fold(${cashAccounts.displayName}) ILIKE vuarau_fold(${pattern})`);
      }
      if (args.page.after !== null) {
        filters.push(
          sql`(${cashAccounts.displayName}, ${cashAccounts.id}) > (${args.page.after.sortValue}, ${args.page.after.id}::uuid)`,
        );
      }
      const rows = await tx
        .select({ account: cashAccounts, balance: cashBalances })
        .from(cashAccounts)
        .leftJoin(
          cashBalances,
          and(
            eq(cashBalances.workspaceId, cashAccounts.workspaceId),
            eq(cashBalances.cashAccountId, cashAccounts.id),
          ),
        )
        .where(and(...filters))
        .orderBy(asc(cashAccounts.displayName), asc(cashAccounts.id))
        .limit(fetchLimit(args.page));
      return paged(
        rows.map(({ account: accountRow, balance }) => {
          const account = accountDto(accountRow);
          return { account, balance: balanceDto(balance, account) };
        }),
        args.page,
        (row) => ({ sortValue: row.account.displayName, id: row.account.id }),
      );
    },
    async account(workspaceId: WorkspaceId, cashAccountId: CashAccountId) {
      const row = (
        await tx
          .select({ account: cashAccounts, balance: cashBalances })
          .from(cashAccounts)
          .leftJoin(
            cashBalances,
            and(
              eq(cashBalances.workspaceId, cashAccounts.workspaceId),
              eq(cashBalances.cashAccountId, cashAccounts.id),
            ),
          )
          .where(and(eq(cashAccounts.workspaceId, workspaceId), eq(cashAccounts.id, cashAccountId)))
          .limit(1)
      )[0];
      if (row === undefined) return null;
      const account = accountDto(row.account);
      return { account, balance: balanceDto(row.balance, account) };
    },
    async timeline(args: {
      workspaceId: WorkspaceId;
      cashAccountId: CashAccountId;
      from: string | null;
      to: string | null;
      page: Page;
    }) {
      const filters: SQL[] = [
        eq(cashMovements.workspaceId, args.workspaceId),
        eq(cashMovements.cashAccountId, args.cashAccountId),
      ];
      if (args.from !== null)
        filters.push(sql`${cashMovements.transactionTime} >= ${args.from}::timestamptz`);
      if (args.to !== null)
        filters.push(sql`${cashMovements.transactionTime} < ${args.to}::timestamptz`);
      if (args.page.after !== null) {
        const [transactionTime, recordedAt] = args.page.after.sortValue.split("|");
        filters.push(sql`(${cashMovements.transactionTime}, ${cashMovements.recordedAt}, ${cashMovements.id})
          < (${transactionTime}::timestamptz, ${recordedAt}::timestamptz, ${args.page.after.id}::uuid)`);
      }
      const rows = await tx
        .select()
        .from(cashMovements)
        .where(and(...filters))
        .orderBy(
          desc(cashMovements.transactionTime),
          desc(cashMovements.recordedAt),
          desc(cashMovements.id),
        )
        .limit(fetchLimit(args.page));
      return paged(rows.map(movementDto), args.page, (movement) => ({
        sortValue: `${movement.transactionTime}|${movement.recordedAt}`,
        id: movement.id,
      }));
    },
    expense: (workspaceId: WorkspaceId, expenseId: ExpenseId) =>
      readExpense(tx, workspaceId, expenseId),
    transfer: (workspaceId: WorkspaceId, transferId: CashTransferId) =>
      readTransfer(tx, workspaceId, transferId),
    async reconciliation(
      workspaceId: WorkspaceId,
      cashAccountId: CashAccountId,
    ): Promise<CashReconciliationDto> {
      const account = await this.account(workspaceId, cashAccountId);
      if (account === null) {
        return {
          status: "not_found",
          cashAccountId,
          projected: null,
          canonical: null,
          diagnostics: [],
        };
      }
      const aggregate = (
        await tx
          .select({
            amountMinor: sql<number>`coalesce(sum(${cashMovements.amountMinor}), 0)::bigint`,
            movementCount: sql<number>`count(*)::integer`,
            lastTransactionTime: sql<Date | null>`max(${cashMovements.transactionTime})`,
            lastRecordedAt: sql<Date | null>`max(${cashMovements.recordedAt})`,
          })
          .from(cashMovements)
          .where(
            and(
              eq(cashMovements.workspaceId, workspaceId),
              eq(cashMovements.cashAccountId, cashAccountId),
            ),
          )
      )[0]!;
      const diagnosticsRows = await tx.execute(sql`
        select case
          when cm.amount_minor = 0 then 'zero_movement'
          when cm.currency <> ca.currency then 'currency_mismatch'
          when cm.source_type = 'customer_payment' and
            (p.id is null or cm.amount_minor <> p.amount_minor
              or cm.cash_account_id <> p.cash_account_id)
            then 'missing_or_mismatched_customer_payment'
          when cm.source_type = 'customer_payment_reversal' and
            (pr.id is null or p2.id is null or cm.amount_minor <> -pr.amount_minor
              or cm.cash_account_id <> coalesce(p2.cash_account_id, cm.cash_account_id))
            then 'missing_or_mismatched_customer_payment_reversal'
          when cm.source_type = 'supplier_payment' and
            (sp.id is null or cm.amount_minor <> -sp.amount_minor
              or cm.cash_account_id <> sp.cash_account_id)
            then 'missing_or_mismatched_supplier_payment'
          when cm.source_type = 'supplier_payment_reversal' and
            (spr.id is null or sp2.id is null or cm.amount_minor <> spr.amount_minor
              or cm.cash_account_id <> coalesce(sp2.cash_account_id, cm.cash_account_id))
            then 'missing_or_mismatched_supplier_payment_reversal'
          when cm.source_type = 'expense' and
            (e.id is null or cm.amount_minor <> -e.amount_minor or cm.cash_account_id <> e.cash_account_id)
            then 'missing_or_mismatched_expense'
          when cm.source_type = 'expense_reversal' and
            (er.id is null or e2.id is null or cm.amount_minor <> e2.amount_minor
              or cm.cash_account_id <> e2.cash_account_id)
            then 'missing_or_mismatched_expense_reversal'
          when cm.source_type in ('cash_transfer_out', 'cash_transfer_in') and
            (ct.id is null or
              (cm.source_type = 'cash_transfer_out' and
                (cm.cash_account_id <> ct.from_cash_account_id or cm.amount_minor <> -ct.amount_minor)) or
              (cm.source_type = 'cash_transfer_in' and
                (cm.cash_account_id <> ct.to_cash_account_id or cm.amount_minor <> ct.amount_minor)))
            then 'missing_or_mismatched_transfer'
          when cm.source_type in ('cash_transfer_reversal_out', 'cash_transfer_reversal_in') and
            (ctr.id is null or ct2.id is null or
              (cm.source_type = 'cash_transfer_reversal_out' and
                (cm.cash_account_id <> ct2.from_cash_account_id or cm.amount_minor <> ct2.amount_minor)) or
              (cm.source_type = 'cash_transfer_reversal_in' and
                (cm.cash_account_id <> ct2.to_cash_account_id or cm.amount_minor <> -ct2.amount_minor)))
            then 'missing_or_mismatched_transfer_reversal'
          when cm.source_type = 'cash_adjustment' and
            (cadj.id is null or cm.cash_account_id <> cadj.cash_account_id
              or cm.amount_minor <> cadj.amount_minor)
            then 'missing_or_mismatched_adjustment'
          else null end as diagnostic
        from cash_movements cm
        join cash_accounts ca
          on ca.workspace_id = cm.workspace_id and ca.id = cm.cash_account_id
        left join payments p
          on cm.source_type = 'customer_payment'
          and p.workspace_id = cm.workspace_id and p.id = cm.source_id
        left join payment_reversals pr
          on cm.source_type = 'customer_payment_reversal'
          and pr.workspace_id = cm.workspace_id and pr.id = cm.source_id
        left join payments p2
          on p2.workspace_id = pr.workspace_id and p2.id = pr.payment_id
        left join supplier_payments sp
          on cm.source_type = 'supplier_payment'
          and sp.workspace_id = cm.workspace_id and sp.id = cm.source_id
        left join supplier_payment_reversals spr
          on cm.source_type = 'supplier_payment_reversal'
          and spr.workspace_id = cm.workspace_id and spr.id = cm.source_id
        left join supplier_payments sp2
          on sp2.workspace_id = spr.workspace_id and sp2.id = spr.supplier_payment_id
        left join expenses e
          on cm.source_type = 'expense' and e.workspace_id = cm.workspace_id and e.id = cm.source_id
        left join expense_reversals er
          on cm.source_type = 'expense_reversal' and er.workspace_id = cm.workspace_id and er.id = cm.source_id
        left join expenses e2
          on e2.workspace_id = er.workspace_id and e2.id = er.expense_id
        left join cash_transfers ct
          on cm.source_type in ('cash_transfer_out', 'cash_transfer_in')
          and ct.workspace_id = cm.workspace_id and ct.id = cm.source_id
        left join cash_transfer_reversals ctr
          on cm.source_type in ('cash_transfer_reversal_out', 'cash_transfer_reversal_in')
          and ctr.workspace_id = cm.workspace_id and ctr.id = cm.source_id
        left join cash_transfers ct2
          on ct2.workspace_id = ctr.workspace_id and ct2.id = ctr.transfer_id
        left join cash_adjustments cadj
          on cm.source_type = 'cash_adjustment'
          and cadj.workspace_id = cm.workspace_id and cadj.id = cm.source_id
        where cm.workspace_id = ${workspaceId}::uuid
          and cm.cash_account_id = ${cashAccountId}::uuid
      `);
      const diagnostics = (
        diagnosticsRows as unknown as Array<{ diagnostic: string | null }>
      ).flatMap((row) => (row.diagnostic === null ? [] : [row.diagnostic]));
      const canonical: CashBalanceDto = {
        workspaceId,
        cashAccountId,
        balance: {
          amountMinor: Number(aggregate.amountMinor),
          currency: account.account.currency,
        },
        movementCount: Number(aggregate.movementCount),
        lastMovementTransactionTime: toIsoOrNull(aggregate.lastTransactionTime),
        updatedAt:
          aggregate.lastRecordedAt === null
            ? account.account.createdAt
            : toIso(aggregate.lastRecordedAt),
      };
      if (diagnostics.length > 0) {
        return {
          status: "integrity_failure",
          cashAccountId,
          projected: account.balance,
          canonical,
          diagnostics,
        };
      }
      const consistent =
        account.balance.balance.amountMinor === canonical.balance.amountMinor &&
        account.balance.balance.currency === canonical.balance.currency &&
        account.balance.movementCount === canonical.movementCount;
      return {
        status: consistent ? "consistent" : "inconsistent",
        cashAccountId,
        projected: account.balance,
        canonical,
        diagnostics: consistent ? [] : ["projection_drift"],
      };
    },
  },
});
