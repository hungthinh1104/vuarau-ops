import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { currencyCodeEnum, saleStatusEnum, saleVoidReasonCodeEnum, unitEnum } from "./enums.ts";
import { customers } from "./customer.ts";
import { products } from "./customer.ts";
import { actors, workspaces } from "./workspace.ts";

/**
 * A completed sale. `status` and `version` are the only mutable columns, and only
 * while the sale is a draft: once posted it is immutable (BR-SALE-008), enforced
 * by a trigger as well as by the repository having no update path for it.
 *
 * Note the absence of a `voided` column. Whether the receivable still stands is
 * derived from `sale_voids` — a stored flag would mean updating this row, which
 * is exactly what posting forbids.
 */
export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    status: saleStatusEnum("status").notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    /** Always the sum of the line totals (BR-SALE-001); never client-supplied. */
    totalAmountMinor: bigint("total_amount_minor", { mode: "number" }).notNull(),
    note: text("note"),
    version: integer("version").notNull(),
    /** When the sale happened. Drives aging. */
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    /** When we accepted the draft. */
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    /** A draft the worker thought better of. Kept, not deleted (BR-SALE-018). */
    discardedAt: timestamp("discarded_at", { withTimezone: true }),
    /** Nullable, and a null is never overdue (BR-SALE-017). Most sales are null. */
    dueAt: timestamp("due_at", { withTimezone: true }),
    /** Set once, at draft creation, when this sale corrects a voided one. */
    replacesSaleId: uuid("replaces_sale_id"),
  },
  (table) => [
    index("sales_workspace_status_time_idx").on(
      table.workspaceId,
      table.status,
      table.transactionTime,
    ),
    index("sales_workspace_customer_time_idx").on(
      table.workspaceId,
      table.customerId,
      table.transactionTime,
    ),
    /** Following a correction chain forwards, from the voided sale (BR-SALE-016). */
    index("sales_replaces_idx").on(table.replacesSaleId),
  ],
);

export const saleLines = pgTable(
  "sale_lines",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    /** Snapshot: later catalogue edits must not change a posted sale (BR-SALE-011). */
    productName: text("product_name").notNull(),
    /** Integer milli-units, scale 1000: 1,5 kg is 1500 (BR-SALE-004). */
    quantityScaled: bigint("quantity_scaled", { mode: "number" }).notNull(),
    unit: unitEnum("unit").notNull(),
    unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
    lineTotalMinor: bigint("line_total_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    /** Preserves the order the worker typed them in. */
    position: integer("position").notNull(),
  },
  (table) => [index("sale_lines_sale_idx").on(table.saleId, table.position)],
);

/**
 * One row per voided sale — the record that a posted sale was undone
 * (ADR-0012). Append-only, like the account entries it accompanies.
 *
 * `UNIQUE (sale_id)` is the structural guarantee behind BR-SALE-013: two
 * concurrent voids cannot both land, so a customer cannot be credited twice for
 * one mistake even if the row lock and the domain check were both bypassed.
 */
export const saleVoids = pgTable(
  "sale_voids",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id),
    reasonCode: saleVoidReasonCodeEnum("reason_code").notNull(),
    /** Mandatory free text. What the person disputing a balance actually needs. */
    reason: text("reason").notNull(),
    /** The full posted total, copied from the sale — never supplied by a caller. */
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
    commandId: uuid("command_id").notNull(),
  },
  (table) => [
    unique("sale_voids_sale_unique").on(table.saleId),
    index("sale_voids_workspace_time_idx").on(table.workspaceId, table.transactionTime),
  ],
);
