import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { commandReceipts } from "./command.ts";
import { workspacePolicyKindEnum, workspacePolicyStateEnum } from "./enums.ts";
import { actors, workspaces } from "./workspace.ts";

/**
 * Versioned policy metadata and definitions. This table is deliberately not
 * consumed by named typed adapters only. An approved row is not a generic rule
 * engine permission: each capability must validate its own definition.
 */
export const workspacePolicies = pgTable(
  "workspace_policies",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    policyKind: workspacePolicyKindEnum("policy_kind").notNull(),
    version: integer("version").notNull(),
    state: workspacePolicyStateEnum("state").notNull().default("draft"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    definition: jsonb("definition").notNull(),
    evidenceReferences: text("evidence_references").array().notNull().default([]),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => actors.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    approvedBy: uuid("approved_by").references(() => actors.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    retiredBy: uuid("retired_by").references(() => actors.id),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    commandId: uuid("command_id")
      .notNull()
      .references(() => commandReceipts.commandId),
    reason: text("reason"),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    unique("workspace_policies_kind_version_uq").on(
      table.workspaceId,
      table.policyKind,
      table.version,
    ),
    index("workspace_policies_workspace_kind_idx").on(
      table.workspaceId,
      table.policyKind,
      table.version,
    ),
    index("workspace_policies_workspace_state_idx").on(
      table.workspaceId,
      table.state,
      table.effectiveFrom,
    ),
    check(
      "workspace_policies_effective_range_ck",
      sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`,
    ),
    check("workspace_policies_version_ck", sql`${table.version} >= 1`),
    check(
      "workspace_policies_approval_ck",
      sql`${table.state} <> 'approved'
        or (${table.approvedBy} is not null and ${table.approvedAt} is not null
          and cardinality(${table.evidenceReferences}) > 0)`,
    ),
    check(
      "workspace_policies_retirement_ck",
      sql`${table.state} <> 'retired'
        or (${table.retiredBy} is not null and ${table.retiredAt} is not null)`,
    ),
  ],
);
