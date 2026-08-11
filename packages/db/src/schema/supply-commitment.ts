import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { currencyCodeEnum, supplyCommitmentStatusEnum, unitEnum } from "./enums.ts";
import { products } from "./customer.ts";
import { qualityGrades } from "./quality.ts";
import { workspaces } from "./workspace.ts";
import { suppliers } from "./supplier.ts";
import { safeBigint as bigint } from "./safe-bigint.ts";

export const supplyCommitments = pgTable(
  "supply_commitments",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    supplierId: uuid("supplier_id").notNull(),
    status: supplyCommitmentStatusEnum("status").notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    totalAmountMinor: bigint("total_amount_minor", { mode: "number" }),
    expectedArrivalAt: timestamp("expected_arrival_at", { withTimezone: true }),
    paymentTermsLabel: text("payment_terms_label"),
    paymentTermsDueAt: timestamp("payment_terms_due_at", { withTimezone: true }),
    note: text("note"),
    evidenceReferences: text("evidence_references").array().notNull().default([]),
    version: integer("version").notNull(),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    replacesSupplyCommitmentId: uuid("replaces_supply_commitment_id"),
  },
  (table) => [
    uniqueIndex("supply_commitments_workspace_id_id_uq").on(table.workspaceId, table.id),
    foreignKey({
      columns: [table.workspaceId, table.supplierId],
      foreignColumns: [suppliers.workspaceId, suppliers.id],
      name: "supply_commitments_workspace_supplier_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.replacesSupplyCommitmentId],
      foreignColumns: [table.workspaceId, table.id],
      name: "supply_commitments_workspace_replacement_fk",
    }),
    uniqueIndex("supply_commitments_replacement_uq")
      .on(table.workspaceId, table.replacesSupplyCommitmentId)
      .where(sql`${table.replacesSupplyCommitmentId} is not null`),
    index("supply_commitments_workspace_time_idx").on(
      table.workspaceId,
      table.transactionTime,
      table.recordedAt,
      table.id,
    ),
    index("supply_commitments_supplier_status_time_idx").on(
      table.workspaceId,
      table.supplierId,
      table.status,
      table.transactionTime,
      table.recordedAt,
      table.id,
    ),
  ],
);

export const supplyCommitmentLines = pgTable(
  "supply_commitment_lines",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    supplyCommitmentId: uuid("supply_commitment_id").notNull(),
    position: integer("position").notNull(),
    productId: uuid("product_id"),
    qualityGradeId: uuid("quality_grade_id"),
    productName: text("product_name").notNull(),
    quantityScaled: bigint("quantity_scaled", { mode: "number" }).notNull(),
    unit: unitEnum("unit").notNull(),
    agreedUnitPriceMinor: bigint("agreed_unit_price_minor", { mode: "number" }),
    lineTotalMinor: bigint("line_total_minor", { mode: "number" }),
    currency: currencyCodeEnum("currency").notNull(),
  },
  (table) => [
    uniqueIndex("supply_commitment_lines_commitment_id_id_uq").on(
      table.supplyCommitmentId,
      table.id,
    ),
    uniqueIndex("supply_commitment_lines_commitment_position_uq").on(
      table.workspaceId,
      table.supplyCommitmentId,
      table.position,
    ),
    uniqueIndex("supply_commitment_lines_workspace_id_id_uq").on(table.workspaceId, table.id),
    index("supply_commitment_lines_product_idx").on(table.workspaceId, table.productId),
    foreignKey({
      columns: [table.workspaceId, table.supplyCommitmentId],
      foreignColumns: [supplyCommitments.workspaceId, supplyCommitments.id],
      name: "supply_commitment_lines_workspace_commitment_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.productId],
      foreignColumns: [products.workspaceId, products.id],
      name: "supply_commitment_lines_workspace_product_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.qualityGradeId],
      foreignColumns: [qualityGrades.workspaceId, qualityGrades.id],
      name: "supply_commitment_lines_workspace_quality_grade_fk",
    }),
  ],
);
