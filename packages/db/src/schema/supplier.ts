import {
  bigint,
  boolean,
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
import { commandReceipts } from "./command.ts";
import { currencyCodeEnum, paymentMethodEnum, supplierAccountSourceTypeEnum } from "./enums.ts";

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    displayName: text("display_name").notNull(),
    phone: text("phone"),
    note: text("note"),
    isActive: boolean("is_active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("suppliers_workspace_id_id_uq").on(table.workspaceId, table.id),
    index("suppliers_workspace_name_idx").on(table.workspaceId, table.displayName, table.id),
  ],
);

export const supplierPayments = pgTable(
  "supplier_payments",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    supplierId: uuid("supplier_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    method: paymentMethodEnum("method").notNull(),
    note: text("note"),
    reversedAmountMinor: bigint("reversed_amount_minor", { mode: "number" }).notNull().default(0),
    version: integer("version").notNull().default(1),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("supplier_payments_workspace_id_id_uq").on(table.workspaceId, table.id),
    index("supplier_payments_supplier_time_idx").on(
      table.workspaceId,
      table.supplierId,
      table.transactionTime,
      table.recordedAt,
      table.id,
    ),
  ],
);

export const supplierPaymentReversals = pgTable(
  "supplier_payment_reversals",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    supplierPaymentId: uuid("supplier_payment_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    reason: text("reason").notNull(),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("supplier_payment_reversals_payment_idx").on(table.workspaceId, table.supplierPaymentId),
  ],
);

export const supplierAccountEntries = pgTable(
  "supplier_account_entries",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    supplierId: uuid("supplier_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    sourceType: supplierAccountSourceTypeEnum("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    reversalOfEntryId: uuid("reversal_of_entry_id"),
    reasonCode: text("reason_code"),
    reason: text("reason"),
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
    uniqueIndex("supplier_account_entries_source_uq").on(
      table.workspaceId,
      table.sourceType,
      table.sourceId,
    ),
    index("supplier_account_entries_timeline_idx").on(
      table.workspaceId,
      table.supplierId,
      table.transactionTime,
      table.recordedAt,
      table.id,
    ),
    index("supplier_account_entries_workspace_time_idx").on(
      table.workspaceId,
      table.transactionTime,
      table.recordedAt,
      table.id,
    ),
  ],
);

export const supplierAccountBalances = pgTable(
  "supplier_account_balances",
  {
    workspaceId: uuid("workspace_id").notNull(),
    supplierId: uuid("supplier_id").notNull(),
    balanceMinor: bigint("balance_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    entryCount: integer("entry_count").notNull(),
    lastEntryTransactionTime: timestamp("last_entry_transaction_time", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.supplierId] })],
);
