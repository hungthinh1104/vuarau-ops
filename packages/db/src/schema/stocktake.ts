import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { commandReceipts } from "./command.ts";
import { stocktakeStateEnum, unitEnum } from "./enums.ts";
import { actors, workspaces } from "./workspace.ts";
import { products } from "./customer.ts";
import { qualityGrades } from "./quality.ts";
import { workspacePolicies } from "./policy.ts";

export const stocktakeSessions = pgTable(
  "stocktake_sessions",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    scopeReference: text("scope_reference").notNull(),
    note: text("note"),
    status: stocktakeStateEnum("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    policyVersionId: uuid("policy_version_id").notNull(),
    varianceMovementIds: uuid("variance_movement_ids").array().notNull().default([]),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
    evidenceReferences: text("evidence_references").array().notNull().default([]),
    commandId: uuid("command_id")
      .notNull()
      .references(() => commandReceipts.commandId),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index("stocktake_sessions_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.asOf,
      table.id,
    ),
    foreignKey({
      columns: [table.workspaceId, table.policyVersionId],
      foreignColumns: [workspacePolicies.workspaceId, workspacePolicies.id],
      name: "stocktake_sessions_workspace_policy_fk",
    }),
    check("stocktake_sessions_version_ck", sql`${table.version} >= 1`),
  ],
);

export const stocktakeCounts = pgTable(
  "stocktake_counts",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    productId: uuid("product_id").notNull(),
    qualityGradeId: uuid("quality_grade_id"),
    qualityGradeName: text("quality_grade_name"),
    quantityScaled: bigint("quantity_scaled", { mode: "number" }).notNull(),
    unit: unitEnum("unit").notNull(),
    supersedesCountId: uuid("supersedes_count_id"),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
    evidenceReferences: text("evidence_references").array().notNull().default([]),
    commandId: uuid("command_id")
      .notNull()
      .references(() => commandReceipts.commandId),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index("stocktake_counts_workspace_session_idx").on(
      table.workspaceId,
      table.sessionId,
      table.recordedAt,
      table.id,
    ),
    foreignKey({
      columns: [table.workspaceId, table.sessionId],
      foreignColumns: [stocktakeSessions.workspaceId, stocktakeSessions.id],
      name: "stocktake_counts_workspace_session_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.productId],
      foreignColumns: [products.workspaceId, products.id],
      name: "stocktake_counts_workspace_product_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.qualityGradeId],
      foreignColumns: [qualityGrades.workspaceId, qualityGrades.id],
      name: "stocktake_counts_workspace_grade_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.supersedesCountId],
      foreignColumns: [table.workspaceId, table.id],
      name: "stocktake_counts_workspace_supersedes_fk",
    }),
    check("stocktake_counts_quantity_ck", sql`${table.quantityScaled} >= 0`),
  ],
);
