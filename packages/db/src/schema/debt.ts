import {
  bigint,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { currencyCodeEnum, debtAdjustmentReasonCodeEnum, ledgerSourceTypeEnum } from "./enums.ts";
import { actors, workspaces } from "./workspace.ts";
import { customers } from "./customer.ts";

/**
 * The source of truth for customer debt. **Append-only** — a trigger raises on
 * UPDATE and DELETE (BR-ACCOUNT-005).
 *
 * `amount_minor` is signed: positive means the customer owes more.
 */
export const debtLedgerEntries = pgTable(
  "debt_ledger_entries",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    sourceType: ledgerSourceTypeEnum("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    /** Points at the entry this one compensates. The original is never touched. */
    reversalOfEntryId: uuid("reversal_of_entry_id"),
    reasonCode: debtAdjustmentReasonCodeEnum("reason_code"),
    reason: text("reason"),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    /** Never null: every đồng of movement traces to a person (BR-ACCOUNT-004). */
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
    commandId: uuid("command_id").notNull(),
  },
  (table) => [
    /**
     * The structural guarantee behind BR-SALE-007: one confirmation of an order
     * can produce at most one entry for it. A retry that slipped past the
     * idempotency layer hits this constraint and rolls back, rather than doubling
     * a customer's debt.
     */
    unique("debt_ledger_entries_source_unique").on(table.sourceType, table.sourceId),
    index("debt_ledger_entries_workspace_customer_time_idx").on(
      table.workspaceId,
      table.customerId,
      table.transactionTime,
    ),
    index("debt_ledger_entries_command_idx").on(table.commandId),
  ],
);

/**
 * A projection of the table above, maintained in the same transaction as the
 * entry that moves it, and rebuildable from scratch at any time (BR-ACCOUNT-006).
 * Deleting a row here loses nothing.
 */
export const customerDebtSummaries = pgTable(
  "customer_debt_summaries",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    /** May be negative — that means the customer is in credit (ASM-001). */
    balanceMinor: bigint("balance_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    entryCount: integer("entry_count").notNull(),
    lastEntryTransactionTime: timestamp("last_entry_transaction_time", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.customerId] })],
);
