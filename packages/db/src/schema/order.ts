import { bigint, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { currencyCodeEnum, orderStatusEnum, unitEnum } from "./enums.ts";
import { customers } from "./customer.ts";
import { products } from "./customer.ts";
import { workspaces } from "./workspace.ts";

/**
 * `status` and `version` are the only mutable columns; a confirmed order is never
 * deleted (BR-SALE-008), enforced by a trigger as well as by the repository
 * having no delete method.
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    status: orderStatusEnum("status").notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    /** Always the sum of the line totals (BR-SALE-001); never client-supplied. */
    totalAmountMinor: bigint("total_amount_minor", { mode: "number" }).notNull(),
    note: text("note"),
    version: integer("version").notNull(),
    /** When the sale happened. Drives debt aging. */
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    /** When we accepted the draft. */
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (table) => [
    index("orders_workspace_status_time_idx").on(
      table.workspaceId,
      table.status,
      table.transactionTime,
    ),
    index("orders_workspace_customer_time_idx").on(
      table.workspaceId,
      table.customerId,
      table.transactionTime,
    ),
  ],
);

export const orderLines = pgTable(
  "order_lines",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    /** Snapshot: later catalogue edits must not change a confirmed debt (ASM-008). */
    productName: text("product_name").notNull(),
    /** Integer milli-units, scale 1000: 1,5 kg is 1500 (BR-SALE-004). */
    quantityScaled: bigint("quantity_scaled", { mode: "number" }).notNull(),
    unit: unitEnum("unit").notNull(),
    unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
    lineTotalMinor: bigint("line_total_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    /** Preserves the order the worker typed them in. */
    position: integer("position").notNull(),
  },
  (table) => [index("order_lines_order_idx").on(table.orderId, table.position)],
);
