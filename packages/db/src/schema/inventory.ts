import { sql } from "drizzle-orm";
import {
  bigint,
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
import { products } from "./customer.ts";
import { purchases, purchaseLines } from "./purchase.ts";
import { commandReceipts } from "./command.ts";
import { inventoryMovementSourceTypeEnum, unitEnum } from "./enums.ts";

export const purchaseReceipts = pgTable(
  "purchase_receipts",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id),
    note: text("note"),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
  },
  (table) => [
    uniqueIndex("purchase_receipts_workspace_id_id_uq").on(table.workspaceId, table.id),
    index("purchase_receipts_purchase_idx").on(
      table.workspaceId,
      table.purchaseId,
      table.transactionTime,
    ),
  ],
);
export const purchaseReceiptLines = pgTable(
  "purchase_receipt_lines",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => purchaseReceipts.id),
    purchaseLineId: uuid("purchase_line_id")
      .notNull()
      .references(() => purchaseLines.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    quantityScaled: bigint("quantity_scaled", { mode: "number" }).notNull(),
    unit: unitEnum("unit").notNull(),
  },
  (table) => [
    uniqueIndex("purchase_receipt_lines_receipt_line_uq").on(table.receiptId, table.purchaseLineId),
  ],
);
export const purchaseReceiptReversals = pgTable(
  "purchase_receipt_reversals",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => purchaseReceipts.id),
    reasonCode: text("reason_code").notNull(),
    reason: text("reason").notNull(),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
  },
  (table) => [
    uniqueIndex("purchase_receipt_reversals_receipt_uq").on(table.workspaceId, table.receiptId),
  ],
);
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    quantityScaled: bigint("quantity_scaled", { mode: "number" }).notNull(),
    unit: unitEnum("unit").notNull(),
    sourceType: inventoryMovementSourceTypeEnum("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    sourceLineId: uuid("source_line_id"),
    reversalOfMovementId: uuid("reversal_of_movement_id"),
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
    uniqueIndex("inventory_movements_adjustment_source_uq")
      .on(table.workspaceId, table.sourceType, table.sourceId)
      .where(sql`${table.sourceType} = 'inventory_adjustment'`),
    uniqueIndex("inventory_movements_line_source_uq")
      .on(table.workspaceId, table.sourceType, table.sourceId, table.sourceLineId)
      .where(sql`${table.sourceLineId} is not null`),
    index("inventory_movements_timeline_idx").on(
      table.workspaceId,
      table.productId,
      table.unit,
      table.transactionTime,
      table.recordedAt,
      table.id,
    ),
    index("inventory_movements_workspace_time_idx").on(
      table.workspaceId,
      table.transactionTime,
      table.recordedAt,
      table.id,
    ),
  ],
);
export const inventoryBalances = pgTable(
  "inventory_balances",
  {
    workspaceId: uuid("workspace_id").notNull(),
    productId: uuid("product_id").notNull(),
    unit: unitEnum("unit").notNull(),
    quantityScaled: bigint("quantity_scaled", { mode: "number" }).notNull(),
    movementCount: integer("movement_count").notNull(),
    lastMovementTransactionTime: timestamp("last_movement_transaction_time", {
      withTimezone: true,
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.productId, table.unit] })],
);
