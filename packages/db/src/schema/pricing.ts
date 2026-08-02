import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { customers, products } from "./customer.ts";
import { actors, workspaces } from "./workspace.ts";
import { currencyCodeEnum, priceRuleKindEnum, unitEnum } from "./enums.ts";
import { qualityGrades } from "./quality.ts";

/**
 * Append-only price facts. A posted sale keeps its own agreed-price snapshot;
 * this table is a catalogue of explicit rules used before agreement, never a
 * mutable source for historical sales.
 */
export const priceRules = pgTable(
  "price_rules",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    productId: uuid("product_id").notNull(),
    qualityGradeId: uuid("quality_grade_id"),
    customerId: uuid("customer_id"),
    unit: unitEnum("unit").notNull(),
    kind: priceRuleKindEnum("kind").notNull(),
    priority: integer("priority").notNull().default(0),
    minimumQuantityScaled: bigint("minimum_quantity_scaled", { mode: "number" })
      .notNull()
      .default(0),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    baseUnitPriceMinor: bigint("base_unit_price_minor", { mode: "number" }).notNull(),
    discountPerUnitMinor: bigint("discount_per_unit_minor", { mode: "number" }).notNull(),
    feePerUnitMinor: bigint("fee_per_unit_minor", { mode: "number" }).notNull(),
    finalUnitPriceMinor: bigint("final_unit_price_minor", { mode: "number" }).notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    reason: text("reason"),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id),
    commandId: uuid("command_id").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("price_rules_workspace_id_id_uq").on(table.workspaceId, table.id),
    index("price_rules_resolution_idx").on(
      table.workspaceId,
      table.productId,
      table.qualityGradeId,
      table.unit,
      table.effectiveFrom,
    ),
    index("price_rules_customer_idx").on(
      table.workspaceId,
      table.customerId,
      table.productId,
      table.effectiveFrom,
    ),
    check("price_rules_priority_ck", sql`${table.priority} >= 0`),
    check("price_rules_quantity_ck", sql`${table.minimumQuantityScaled} >= 0`),
    check("price_rules_base_price_ck", sql`${table.baseUnitPriceMinor} >= 0`),
    check("price_rules_discount_ck", sql`${table.discountPerUnitMinor} >= 0`),
    check("price_rules_fee_ck", sql`${table.feePerUnitMinor} >= 0`),
    check("price_rules_final_price_ck", sql`${table.finalUnitPriceMinor} >= 0`),
    check(
      "price_rules_effective_period_ck",
      sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`,
    ),
    foreignKey({
      columns: [table.workspaceId, table.productId],
      foreignColumns: [products.workspaceId, products.id],
      name: "price_rules_workspace_product_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.qualityGradeId],
      foreignColumns: [qualityGrades.workspaceId, qualityGrades.id],
      name: "price_rules_workspace_quality_grade_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.customerId],
      foreignColumns: [customers.workspaceId, customers.id],
      name: "price_rules_workspace_customer_fk",
    }),
  ],
);
