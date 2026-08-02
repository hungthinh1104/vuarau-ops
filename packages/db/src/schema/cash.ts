import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { actors, workspaces } from "./workspace.ts";
import { currencyCodeEnum } from "./enums.ts";
import {
  cashAccountKindEnum,
  cashAdjustmentReasonCodeEnum,
  cashMovementSourceTypeEnum,
  expenseCategoryEnum,
} from "./enums.ts";
import { commandReceipts } from "./command.ts";

export const cashAccounts = pgTable(
  "cash_accounts",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    displayName: text("display_name").notNull(),
    kind: cashAccountKindEnum("kind").notNull(),
    currency: currencyCodeEnum("currency").notNull().default("VND"),
    custodianActorId: uuid("custodian_actor_id").references(() => actors.id),
    note: text("note"),
    isActive: boolean("is_active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    uniqueIndex("cash_accounts_workspace_id_id_uq").on(table.workspaceId, table.id),
    index("cash_accounts_workspace_name_idx").on(table.workspaceId, table.displayName, table.id),
    check(
      "cash_accounts_custodian_ck",
      sql`(${table.kind} = 'employee_holding' and ${table.custodianActorId} is not null)
        or (${table.kind} <> 'employee_holding' and ${table.custodianActorId} is null)`,
    ),
    check("cash_accounts_version_ck", sql`${table.version} >= 1`),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    cashAccountId: uuid("cash_account_id").notNull(),
    category: expenseCategoryEnum("category").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    payee: text("payee"),
    note: text("note").notNull(),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
    commandId: uuid("command_id")
      .notNull()
      .references(() => commandReceipts.commandId),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId, table.cashAccountId],
      foreignColumns: [cashAccounts.workspaceId, cashAccounts.id],
      name: "expenses_workspace_cash_account_fk",
    }),
    check("expenses_amount_ck", sql`${table.amountMinor} > 0`),
    index("expenses_account_time_idx").on(
      table.workspaceId,
      table.cashAccountId,
      table.transactionTime,
      table.recordedAt,
      table.id,
    ),
  ],
);

export const expenseReversals = pgTable(
  "expense_reversals",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    expenseId: uuid("expense_id").notNull(),
    reason: text("reason").notNull(),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
    commandId: uuid("command_id")
      .notNull()
      .references(() => commandReceipts.commandId),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId, table.expenseId],
      foreignColumns: [expenses.workspaceId, expenses.id],
      name: "expense_reversals_workspace_expense_fk",
    }),
    uniqueIndex("expense_reversals_expense_uq").on(table.workspaceId, table.expenseId),
  ],
);

export const cashTransfers = pgTable(
  "cash_transfers",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    fromCashAccountId: uuid("from_cash_account_id").notNull(),
    toCashAccountId: uuid("to_cash_account_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    note: text("note"),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
    commandId: uuid("command_id")
      .notNull()
      .references(() => commandReceipts.commandId),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId, table.fromCashAccountId],
      foreignColumns: [cashAccounts.workspaceId, cashAccounts.id],
      name: "cash_transfers_workspace_from_account_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.toCashAccountId],
      foreignColumns: [cashAccounts.workspaceId, cashAccounts.id],
      name: "cash_transfers_workspace_to_account_fk",
    }),
    check(
      "cash_transfers_accounts_ck",
      sql`${table.fromCashAccountId} <> ${table.toCashAccountId}`,
    ),
    check("cash_transfers_amount_ck", sql`${table.amountMinor} > 0`),
    index("cash_transfers_workspace_time_idx").on(
      table.workspaceId,
      table.transactionTime,
      table.recordedAt,
      table.id,
    ),
  ],
);

export const cashTransferReversals = pgTable(
  "cash_transfer_reversals",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    transferId: uuid("transfer_id").notNull(),
    reason: text("reason").notNull(),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
    commandId: uuid("command_id")
      .notNull()
      .references(() => commandReceipts.commandId),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId, table.transferId],
      foreignColumns: [cashTransfers.workspaceId, cashTransfers.id],
      name: "cash_transfer_reversals_workspace_transfer_fk",
    }),
    uniqueIndex("cash_transfer_reversals_transfer_uq").on(table.workspaceId, table.transferId),
  ],
);

export const cashAdjustments = pgTable(
  "cash_adjustments",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    cashAccountId: uuid("cash_account_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    reasonCode: cashAdjustmentReasonCodeEnum("reason_code").notNull(),
    reason: text("reason").notNull(),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
    commandId: uuid("command_id")
      .notNull()
      .references(() => commandReceipts.commandId),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId, table.cashAccountId],
      foreignColumns: [cashAccounts.workspaceId, cashAccounts.id],
      name: "cash_adjustments_workspace_cash_account_fk",
    }),
    check("cash_adjustments_amount_ck", sql`${table.amountMinor} <> 0`),
  ],
);

export const cashMovements = pgTable(
  "cash_movements",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    cashAccountId: uuid("cash_account_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    sourceType: cashMovementSourceTypeEnum("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    reversalOfMovementId: uuid("reversal_of_movement_id"),
    note: text("note"),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
    commandId: uuid("command_id")
      .notNull()
      .references(() => commandReceipts.commandId),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId, table.cashAccountId],
      foreignColumns: [cashAccounts.workspaceId, cashAccounts.id],
      name: "cash_movements_workspace_cash_account_fk",
    }),
    uniqueIndex("cash_movements_source_account_uq").on(
      table.workspaceId,
      table.sourceType,
      table.sourceId,
      table.cashAccountId,
    ),
    check("cash_movements_amount_ck", sql`${table.amountMinor} <> 0`),
    index("cash_movements_account_time_idx").on(
      table.workspaceId,
      table.cashAccountId,
      table.transactionTime,
      table.recordedAt,
      table.id,
    ),
  ],
);

export const cashBalances = pgTable(
  "cash_balances",
  {
    workspaceId: uuid("workspace_id").notNull(),
    cashAccountId: uuid("cash_account_id").notNull(),
    balanceMinor: bigint("balance_minor", { mode: "number" }).notNull().default(0),
    currency: currencyCodeEnum("currency").notNull().default("VND"),
    movementCount: integer("movement_count").notNull().default(0),
    lastMovementTransactionTime: timestamp("last_movement_transaction_time", {
      withTimezone: true,
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.cashAccountId] }),
    foreignKey({
      columns: [table.workspaceId, table.cashAccountId],
      foreignColumns: [cashAccounts.workspaceId, cashAccounts.id],
      name: "cash_balances_workspace_cash_account_fk",
    }),
  ],
);
