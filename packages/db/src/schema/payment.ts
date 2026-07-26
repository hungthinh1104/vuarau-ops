import { bigint, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { currencyCodeEnum, paymentMethodEnum, paymentStatusEnum } from "./enums.ts";
import { customers } from "./customer.ts";
import { workspaces } from "./workspace.ts";

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
    /** Who physically handed over the money, when that is not the customer. */
    payerName: text("payer_name"),
    note: text("note"),
    status: paymentStatusEnum("status").notNull(),
    reversedAmountMinor: bigint("reversed_amount_minor", { mode: "number" }).notNull().default(0),
    version: integer("version").notNull(),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
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
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("payment_reversals_payment_idx").on(table.paymentId)],
);
