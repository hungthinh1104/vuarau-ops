import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  currencyCodeEnum,
  customerOrderChannelEnum,
  customerOrderStatusEnum,
  unitEnum,
} from "./enums.ts";
import { customers, products } from "./customer.ts";
import { workspaces } from "./workspace.ts";

export const customerOrders = pgTable(
  "customer_orders",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    customerId: uuid("customer_id").references(() => customers.id),
    channel: customerOrderChannelEnum("channel").notNull(),
    status: customerOrderStatusEnum("status").notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    totalAmountMinor: bigint("total_amount_minor", { mode: "number" }),
    note: text("note"),
    paymentTermsLabel: text("payment_terms_label"),
    paymentTermsDueAt: timestamp("payment_terms_due_at", { withTimezone: true }),
    evidenceReferences: text("evidence_references").array().notNull().default([]),
    version: integer("version").notNull(),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    replacesCustomerOrderId: uuid("replaces_customer_order_id"),
  },
  (table) => [
    uniqueIndex("customer_orders_workspace_id_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("customer_orders_replacement_uq")
      .on(table.workspaceId, table.replacesCustomerOrderId)
      .where(sql`${table.replacesCustomerOrderId} is not null`),
    index("customer_orders_workspace_time_idx").on(
      table.workspaceId,
      table.transactionTime,
      table.recordedAt,
      table.id,
    ),
    index("customer_orders_customer_status_time_idx").on(
      table.workspaceId,
      table.customerId,
      table.status,
      table.transactionTime,
      table.recordedAt,
      table.id,
    ),
    check(
      "customer_orders_channel_customer_check",
      sql`(
        (channel in ('account_customer', 'contract_customer') and customer_id is not null)
        or
        (channel in ('walk_in', 'internal_transfer') and customer_id is null)
      )`,
    ),
  ],
);

export const customerOrderLines = pgTable(
  "customer_order_lines",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    customerOrderId: uuid("customer_order_id")
      .notNull()
      .references(() => customerOrders.id),
    productId: uuid("product_id").references(() => products.id),
    productName: text("product_name").notNull(),
    quantityScaled: bigint("quantity_scaled", { mode: "number" }).notNull(),
    unit: unitEnum("unit").notNull(),
    agreedUnitPriceMinor: bigint("agreed_unit_price_minor", { mode: "number" }),
    lineTotalMinor: bigint("line_total_minor", { mode: "number" }),
    currency: currencyCodeEnum("currency").notNull(),
  },
  (table) => [
    uniqueIndex("customer_order_lines_order_id_id_uq").on(table.customerOrderId, table.id),
    index("customer_order_lines_product_idx").on(table.workspaceId, table.productId),
  ],
);
