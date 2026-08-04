import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { commandReceipts } from "./command.ts";
import { cashAccounts, cashMovements } from "./cash.ts";
import { cashMovementSourceTypeEnum, currencyCodeEnum } from "./enums.ts";
import { workspacePolicies } from "./policy.ts";
import { actors, workspaces } from "./workspace.ts";

export const operationalCloses = pgTable(
  "operational_closes",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    businessDate: date("business_date", { mode: "string" }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    observationIds: uuid("observation_ids").array().notNull(),
    evidenceReferences: text("evidence_references").array().notNull(),
    policyVersionId: uuid("policy_version_id").notNull(),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
    commandId: uuid("command_id")
      .notNull()
      .references(() => commandReceipts.commandId),
    reason: text("reason").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    uniqueIndex("operational_closes_workspace_date_uq").on(table.workspaceId, table.businessDate),
    index("operational_closes_workspace_time_idx").on(
      table.workspaceId,
      table.businessDate,
      table.recordedAt,
      table.id,
    ),
    foreignKey({
      columns: [table.workspaceId, table.policyVersionId],
      foreignColumns: [workspacePolicies.workspaceId, workspacePolicies.id],
      name: "operational_closes_workspace_policy_fk",
    }),
    check("operational_closes_period_ck", sql`${table.periodEnd} > ${table.periodStart}`),
    check("operational_closes_observations_ck", sql`cardinality(${table.observationIds}) > 0`),
    check("operational_closes_evidence_ck", sql`cardinality(${table.evidenceReferences}) > 0`),
  ],
);

export const operationalCloseReopens = pgTable(
  "operational_close_reopens",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    operationalCloseId: uuid("operational_close_id").notNull(),
    reason: text("reason").notNull(),
    evidenceReferences: text("evidence_references").array().notNull(),
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
    primaryKey({ columns: [table.workspaceId, table.id] }),
    uniqueIndex("operational_close_reopens_close_uq").on(
      table.workspaceId,
      table.operationalCloseId,
    ),
    foreignKey({
      columns: [table.workspaceId, table.operationalCloseId],
      foreignColumns: [operationalCloses.workspaceId, operationalCloses.id],
      name: "operational_close_reopens_workspace_close_fk",
    }),
    check(
      "operational_close_reopens_evidence_ck",
      sql`cardinality(${table.evidenceReferences}) > 0`,
    ),
  ],
);

export const cashStatementMatches = pgTable(
  "cash_statement_matches",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    cashAccountId: uuid("cash_account_id").notNull(),
    cashMovementId: uuid("cash_movement_id").notNull(),
    externalReference: text("external_reference").notNull(),
    statementAt: timestamp("statement_at", { withTimezone: true }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    sourceType: cashMovementSourceTypeEnum("source_type").notNull(),
    policyVersionId: uuid("policy_version_id").notNull(),
    evidenceReferences: text("evidence_references").array().notNull(),
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
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index("cash_statement_matches_workspace_movement_idx").on(
      table.workspaceId,
      table.cashMovementId,
    ),
    index("cash_statement_matches_workspace_reference_idx").on(
      table.workspaceId,
      table.externalReference,
    ),
    foreignKey({
      columns: [table.workspaceId, table.cashAccountId],
      foreignColumns: [cashAccounts.workspaceId, cashAccounts.id],
      name: "cash_statement_matches_workspace_account_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.cashMovementId],
      foreignColumns: [cashMovements.workspaceId, cashMovements.id],
      name: "cash_statement_matches_workspace_movement_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.policyVersionId],
      foreignColumns: [workspacePolicies.workspaceId, workspacePolicies.id],
      name: "cash_statement_matches_workspace_policy_fk",
    }),
    check("cash_statement_matches_evidence_ck", sql`cardinality(${table.evidenceReferences}) > 0`),
  ],
);

export const cashStatementMatchReversals = pgTable(
  "cash_statement_match_reversals",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    cashStatementMatchId: uuid("cash_statement_match_id").notNull(),
    reason: text("reason").notNull(),
    evidenceReferences: text("evidence_references").array().notNull(),
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
    primaryKey({ columns: [table.workspaceId, table.id] }),
    uniqueIndex("cash_statement_match_reversals_match_uq").on(
      table.workspaceId,
      table.cashStatementMatchId,
    ),
    foreignKey({
      columns: [table.workspaceId, table.cashStatementMatchId],
      foreignColumns: [cashStatementMatches.workspaceId, cashStatementMatches.id],
      name: "cash_statement_match_reversals_workspace_match_fk",
    }),
    check(
      "cash_statement_match_reversals_evidence_ck",
      sql`cardinality(${table.evidenceReferences}) > 0`,
    ),
  ],
);
