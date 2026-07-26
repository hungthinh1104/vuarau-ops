import { index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { commandReceiptStatusEnum } from "./enums.ts";
import { actors, workspaces } from "./workspace.ts";
import { auditActionEnum, auditAggregateTypeEnum, rejectionCodeEnum } from "./audit-enums.ts";

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
  },
  (table) => [
    unique("command_receipts_workspace_key_unique").on(table.workspaceId, table.idempotencyKey),
    index("command_receipts_workspace_time_idx").on(table.workspaceId, table.recordedAt),
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
  ],
);
