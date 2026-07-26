import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { currencyCodeEnum } from "./enums.ts";
import { workspaces } from "./workspace.ts";

/**
 * Master data. Mutable, and carrying **no balance column** — what a customer owes
 * is the sum of their ledger entries (ADR-0004).
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    displayName: text("display_name").notNull(),
    phone: text("phone"),
    note: text("note"),
    isActive: boolean("is_active").notNull().default(true),
    version: integer("version").notNull().default(1),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("customers_workspace_name_idx").on(table.workspaceId, table.displayName)],
);

/** Catalogue for order lines. Order lines snapshot name and price (ASM-008). */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    /** Suggested price only; the order line's snapshot is what a customer owes. */
    defaultUnitPriceMinor: bigint("default_unit_price_minor", { mode: "number" }),
    currency: currencyCodeEnum("currency").notNull().default("VND"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("products_workspace_name_idx").on(table.workspaceId, table.name)],
);
