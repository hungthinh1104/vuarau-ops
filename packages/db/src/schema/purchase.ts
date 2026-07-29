import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { currencyCodeEnum, purchaseStatusEnum, unitEnum } from "./enums.ts";
import { workspaces, actors } from "./workspace.ts";
import { suppliers } from "./supplier.ts";
import { products } from "./customer.ts";

export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    status: purchaseStatusEnum("status").notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    totalAmountMinor: bigint("total_amount_minor", { mode: "number" }).notNull(),
    note: text("note"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    version: integer("version").notNull(),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    discardedAt: timestamp("discarded_at", { withTimezone: true }),
    replacesPurchaseId: uuid("replaces_purchase_id"),
  },
  (table) => [
    uniqueIndex("purchases_workspace_id_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("purchases_replacement_uq")
      .on(table.workspaceId, table.replacesPurchaseId)
      .where(sql`${table.replacesPurchaseId} is not null`),
    index("purchases_workspace_time_idx").on(
      table.workspaceId,
      table.transactionTime,
      table.recordedAt,
      table.id,
    ),
  ],
);

export const purchaseLines = pgTable(
  "purchase_lines",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    productName: text("product_name").notNull(),
    quantityScaled: bigint("quantity_scaled", { mode: "number" }).notNull(),
    unit: unitEnum("unit").notNull(),
    unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
    lineTotalMinor: bigint("line_total_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
  },
  (table) => [
    uniqueIndex("purchase_lines_purchase_id_id_uq").on(table.purchaseId, table.id),
    index("purchase_lines_product_idx").on(table.workspaceId, table.productId),
  ],
);

export const purchaseVoids = pgTable(
  "purchase_voids",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id),
    reasonCode: text("reason_code").notNull(),
    reason: text("reason").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
  },
  (table) => [uniqueIndex("purchase_voids_purchase_uq").on(table.workspaceId, table.purchaseId)],
);
