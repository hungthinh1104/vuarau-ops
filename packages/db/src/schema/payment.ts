import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { currencyCodeEnum, paymentMethodEnum, paymentStatusEnum } from "./enums.ts";
import { customers } from "./customer.ts";
import { sales } from "./sale.ts";
import { actors, workspaces } from "./workspace.ts";
import { cashAccounts } from "./cash.ts";

/**
 * `reversed_amount`, `status`, and `version` are the only mutable columns, and
 * `reversed_amount` only ever increases. Everything else about a payment is a
 * historical fact.
 *
 * `status` is derived from `reversed_amount` (BR-PAYMENT-008) and stored only so
 * that queries can filter on it.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    method: paymentMethodEnum("method").notNull(),
    cashAccountId: uuid("cash_account_id"),
    /** Who physically handed over the money, when that is not the customer. */
    payerName: text("payer_name"),
    note: text("note"),
    evidenceReferences: text("evidence_references").array().notNull().default([]),
    status: paymentStatusEnum("status").notNull(),
    reversedAmountMinor: bigint("reversed_amount_minor", { mode: "number" }).notNull().default(0),
    version: integer("version").notNull(),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("payments_workspace_id_uq").on(table.workspaceId, table.id),
    foreignKey({
      columns: [table.workspaceId, table.cashAccountId],
      foreignColumns: [cashAccounts.workspaceId, cashAccounts.id],
      name: "payments_workspace_cash_account_fk",
    }),
    index("payments_workspace_customer_time_idx").on(
      table.workspaceId,
      table.customerId,
      table.transactionTime,
    ),
  ],
);

/**
 * Append-only. A reversal is its own record, never a second payment
 * (BR-PAYMENT-005), so that "how much has this customer paid us" stays a plain
 * sum over `payments`.
 */
export const paymentReversals = pgTable(
  "payment_reversals",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    reason: text("reason").notNull(),
    evidenceReferences: text("evidence_references").array().notNull().default([]),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("payment_reversals_payment_idx").on(table.paymentId)],
);

/**
 * A commercial attribution of received money to a posted sale. It never changes
 * the account ledger: the payment already reduced debt when recorded. Reversing
 * an attribution uses the append-only table below, not an update or delete.
 */
export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    paymentId: uuid("payment_id").notNull(),
    saleId: uuid("sale_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    evidenceReferences: text("evidence_references").array().notNull().default([]),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
    commandId: uuid("command_id").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.paymentId],
      foreignColumns: [payments.workspaceId, payments.id],
      name: "payment_allocations_workspace_payment_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.saleId],
      foreignColumns: [sales.workspaceId, sales.id],
      name: "payment_allocations_workspace_sale_fk",
    }),
    check("payment_allocations_amount_positive_ck", sql`${table.amountMinor} > 0`),
    index("payment_allocations_workspace_customer_idx").on(
      table.workspaceId,
      table.customerId,
      table.transactionTime,
      table.id,
    ),
    index("payment_allocations_payment_idx").on(table.workspaceId, table.paymentId),
    index("payment_allocations_sale_idx").on(table.workspaceId, table.saleId),
    uniqueIndex("payment_allocations_workspace_id_uq").on(table.workspaceId, table.id),
  ],
);

export const paymentAllocationReversals = pgTable(
  "payment_allocation_reversals",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    allocationId: uuid("allocation_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    reason: text("reason").notNull(),
    evidenceReferences: text("evidence_references").array().notNull().default([]),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
    commandId: uuid("command_id").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.allocationId],
      foreignColumns: [paymentAllocations.workspaceId, paymentAllocations.id],
      name: "payment_allocation_reversals_workspace_allocation_fk",
    }),
    check("payment_allocation_reversals_amount_positive_ck", sql`${table.amountMinor} > 0`),
    index("payment_allocation_reversals_workspace_customer_idx").on(
      table.workspaceId,
      table.customerId,
      table.transactionTime,
      table.id,
    ),
    index("payment_allocation_reversals_allocation_idx").on(table.workspaceId, table.allocationId),
  ],
);
