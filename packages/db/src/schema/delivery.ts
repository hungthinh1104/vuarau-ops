import {
  bigint,
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
import { actors } from "./workspace.ts";
import { products } from "./customer.ts";
import { sales, saleLines } from "./sale.ts";
import { deliveryStatusEnum, unitEnum } from "./enums.ts";

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    saleId: uuid("sale_id").notNull(),
    status: deliveryStatusEnum("status").notNull(),
    note: text("note"),
    cancellationReason: text("cancellation_reason"),
    version: integer("version").notNull(),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
  },
  (table) => [
    uniqueIndex("deliveries_workspace_id_id_uq").on(table.workspaceId, table.id),
    index("deliveries_sale_timeline_idx").on(
      table.workspaceId,
      table.saleId,
      table.transactionTime,
      table.recordedAt,
      table.id,
    ),
    index("deliveries_workspace_status_time_idx").on(
      table.workspaceId,
      table.status,
      table.transactionTime,
      table.recordedAt,
      table.id,
    ),
    foreignKey({
      columns: [table.workspaceId, table.saleId],
      foreignColumns: [sales.workspaceId, sales.id],
      name: "deliveries_workspace_sale_fk",
    }),
  ],
);

export const deliveryLines = pgTable(
  "delivery_lines",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    deliveryId: uuid("delivery_id").notNull(),
    saleLineId: uuid("sale_line_id").notNull(),
    productId: uuid("product_id").notNull(),
    productName: text("product_name").notNull(),
    quantityScaled: bigint("quantity_scaled", { mode: "number" }).notNull(),
    unit: unitEnum("unit").notNull(),
  },
  (table) => [
    uniqueIndex("delivery_lines_delivery_sale_line_uq").on(table.deliveryId, table.saleLineId),
    foreignKey({
      columns: [table.workspaceId, table.deliveryId],
      foreignColumns: [deliveries.workspaceId, deliveries.id],
      name: "delivery_lines_workspace_delivery_fk",
    }),
    foreignKey({
      columns: [table.saleLineId],
      foreignColumns: [saleLines.id],
      name: "delivery_lines_sale_line_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.productId],
      foreignColumns: [products.workspaceId, products.id],
      name: "delivery_lines_workspace_product_fk",
    }),
  ],
);

export const deliveryReturns = pgTable(
  "delivery_returns",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    deliveryId: uuid("delivery_id").notNull(),
    reason: text("reason").notNull(),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
  },
  (table) => [
    uniqueIndex("delivery_returns_workspace_id_id_uq").on(table.workspaceId, table.id),
    foreignKey({
      columns: [table.workspaceId, table.deliveryId],
      foreignColumns: [deliveries.workspaceId, deliveries.id],
      name: "delivery_returns_workspace_delivery_fk",
    }),
  ],
);

export const deliveryReturnLines = pgTable(
  "delivery_return_lines",
  {
    returnId: uuid("return_id").notNull(),
    deliveryLineId: uuid("delivery_line_id")
      .notNull()
      .references(() => deliveryLines.id),
    quantityScaled: bigint("quantity_scaled", { mode: "number" }).notNull(),
    unit: unitEnum("unit").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.returnId, table.deliveryLineId] }),
    foreignKey({
      columns: [table.returnId],
      foreignColumns: [deliveryReturns.id],
      name: "delivery_return_lines_return_fk",
    }),
  ],
);
