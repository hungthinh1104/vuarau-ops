import { sql } from "drizzle-orm";
import {
  bigint,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { actors, workspaces } from "./workspace.ts";
import { products } from "./customer.ts";
import { purchases, purchaseLines } from "./purchase.ts";
import { commandReceipts } from "./command.ts";
import { inventoryMovementSourceTypeEnum, unitEnum } from "./enums.ts";
import { qualityGrades } from "./quality.ts";

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
    qualityGradeId: uuid("quality_grade_id"),
    qualityGradeName: text("quality_grade_name"),
    quantityScaled: bigint("quantity_scaled", { mode: "number" }).notNull(),
    unit: unitEnum("unit").notNull(),
  },
  (table) => [
    unique("purchase_receipt_lines_receipt_line_grade_uq")
      .on(table.receiptId, table.purchaseLineId, table.qualityGradeId)
      .nullsNotDistinct(),
    foreignKey({
      columns: [table.workspaceId, table.qualityGradeId],
      foreignColumns: [qualityGrades.workspaceId, qualityGrades.id],
      name: "purchase_receipt_lines_workspace_quality_grade_fk",
    }),
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
    qualityGradeId: uuid("quality_grade_id"),
    qualityGradeName: text("quality_grade_name"),
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
      table.qualityGradeId,
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
    foreignKey({
      columns: [table.workspaceId, table.qualityGradeId],
      foreignColumns: [qualityGrades.workspaceId, qualityGrades.id],
      name: "inventory_movements_workspace_quality_grade_fk",
    }),
  ],
);
export const inventoryBalances = pgTable(
  "inventory_balances",
  {
    workspaceId: uuid("workspace_id").notNull(),
    productId: uuid("product_id").notNull(),
    qualityGradeId: uuid("quality_grade_id"),
    unit: unitEnum("unit").notNull(),
    quantityScaled: bigint("quantity_scaled", { mode: "number" }).notNull(),
    movementCount: integer("movement_count").notNull(),
    lastMovementTransactionTime: timestamp("last_movement_transaction_time", {
      withTimezone: true,
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("inventory_balances_workspace_product_grade_unit_uq")
      .on(table.workspaceId, table.productId, table.qualityGradeId, table.unit)
      .nullsNotDistinct(),
    foreignKey({
      columns: [table.workspaceId, table.qualityGradeId],
      foreignColumns: [qualityGrades.workspaceId, qualityGrades.id],
      name: "inventory_balances_workspace_quality_grade_fk",
    }),
  ],
);
