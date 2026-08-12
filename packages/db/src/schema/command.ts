import {
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { commandReceiptStatusEnum } from "./enums.ts";
import { actors, workspaces } from "./workspace.ts";
import { auditActionEnum, auditAggregateTypeEnum, rejectionCodeEnum } from "./audit-enums.ts";
import { safeBigint } from "./safe-bigint.ts";

/**
 * The mechanism behind BR-COMMAND-001. The unique index on
 * (workspace_id, idempotency_key) — not the read that precedes it — is what makes
 * two concurrent replays safe (ADR-0008).
 */
export const commandReceipts = pgTable(
  "command_receipts",
  {
    commandId: uuid("command_id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    idempotencyKey: text("idempotency_key").notNull(),
    commandType: text("command_type").notNull(),
    /** SHA-256 of the canonicalised payload; detects key reuse (BR-COMMAND-002). */
    payloadHash: text("payload_hash").notNull(),
    status: commandReceiptStatusEnum("status").notNull(),
    /** The original result, replayed verbatim to a retry. */
    result: jsonb("result"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    /** Assigned in the same transaction as completion; null while in progress. */
    revision: safeBigint("revision"),
    /** Assigned with revision; null only for in-progress or legacy receipts. */
    topics: jsonb("topics").$type<readonly string[] | null>(),
  },
  (table) => [
    unique("command_receipts_workspace_key_unique").on(table.workspaceId, table.idempotencyKey),
    unique("command_receipts_workspace_command_unique").on(table.workspaceId, table.commandId),
    index("command_receipts_workspace_time_idx").on(table.workspaceId, table.recordedAt),
  ],
);

/**
 * Durable reconciliation feed. LISTEN/NOTIFY wakes clients up, but this table
 * is the source for catching up after a dropped connection or missed publish.
 */
export const workspaceChangeFeed = pgTable(
  "workspace_change_feed",
  {
    commandId: uuid("command_id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    revision: safeBigint("revision").notNull(),
    commandType: text("command_type").notNull(),
    topics: jsonb("topics").$type<readonly string[]>().notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("workspace_change_feed_workspace_revision_unique").on(table.workspaceId, table.revision),
    index("workspace_change_feed_workspace_revision_idx").on(table.workspaceId, table.revision),
    foreignKey({
      columns: [table.workspaceId, table.commandId],
      foreignColumns: [commandReceipts.workspaceId, commandReceipts.commandId],
      name: "workspace_change_feed_workspace_command_fk",
    }),
  ],
);

/**
 * Append-only history of business actions — "who did what and why", not a row
 * diff. `before`/`after` hold short semantic summaries, not whole aggregates:
 * dumping those would copy customer data into a table with a different retention
 * policy.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    commandId: uuid("command_id").notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
    aggregateType: auditAggregateTypeEnum("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    action: auditActionEnum("action").notNull(),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    /** Set when an action was refused or an override applied. */
    rejectionCode: rejectionCodeEnum("rejection_code"),
  },
  (table) => [
    index("audit_logs_workspace_time_idx").on(table.workspaceId, table.recordedAt),
    index("audit_logs_aggregate_idx").on(table.workspaceId, table.aggregateType, table.aggregateId),
    index("audit_logs_command_idx").on(table.commandId),
    foreignKey({
      columns: [table.workspaceId, table.commandId],
      foreignColumns: [commandReceipts.workspaceId, commandReceipts.commandId],
      name: "audit_logs_workspace_command_fk",
    }),
  ],
);
