import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { commandReceipts } from "./command.ts";
import {
  qualityDispositionOutcomeEnum,
  qualityDispositionSourceTypeEnum,
  qualityIssueCategoryEnum,
  qualitySeverityEnum,
  unitEnum,
} from "./enums.ts";
import { products } from "./customer.ts";
import { purchases, purchaseLines } from "./purchase.ts";
import { qualityGrades } from "./quality.ts";
import { suppliers } from "./supplier.ts";
import { actors, workspaces } from "./workspace.ts";

export const qualityIssueCodes = pgTable(
  "quality_issue_codes",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    category: qualityIssueCategoryEnum("category").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    uniqueIndex("quality_issue_codes_workspace_code_uq").on(table.workspaceId, table.code),
    index("quality_issue_codes_workspace_name_idx").on(
      table.workspaceId,
      table.displayName,
      table.id,
    ),
    check("quality_issue_codes_version_ck", sql`${table.version} >= 1`),
  ],
);

export const goodsArrivals = pgTable(
  "goods_arrivals",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    supplierId: uuid("supplier_id").notNull(),
    purchaseId: uuid("purchase_id"),
    vehicleReference: text("vehicle_reference"),
    note: text("note"),
    evidenceReferences: text("evidence_references").array().notNull().default([]),
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
    foreignKey({
      columns: [table.workspaceId, table.supplierId],
      foreignColumns: [suppliers.workspaceId, suppliers.id],
      name: "goods_arrivals_workspace_supplier_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.purchaseId],
      foreignColumns: [purchases.workspaceId, purchases.id],
      name: "goods_arrivals_workspace_purchase_fk",
    }),
    index("goods_arrivals_supplier_time_idx").on(
      table.workspaceId,
      table.supplierId,
      table.transactionTime,
      table.recordedAt,
      table.id,
    ),
  ],
);

export const goodsArrivalLines = pgTable(
  "goods_arrival_lines",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    arrivalId: uuid("arrival_id").notNull(),
    purchaseId: uuid("purchase_id"),
    purchaseLineId: uuid("purchase_line_id"),
    productId: uuid("product_id").notNull(),
    productName: text("product_name").notNull(),
    arrivedValueScaled: integer("arrived_value_scaled").notNull(),
    arrivedUnit: unitEnum("arrived_unit").notNull(),
    containerCount: integer("container_count"),
    grossWeightValueScaled: integer("gross_weight_value_scaled"),
    tareWeightValueScaled: integer("tare_weight_value_scaled"),
    netWeightValueScaled: integer("net_weight_value_scaled"),
    weightUnit: unitEnum("weight_unit"),
    supplierLotCode: text("supplier_lot_code"),
    note: text("note"),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId, table.arrivalId],
      foreignColumns: [goodsArrivals.workspaceId, goodsArrivals.id],
      name: "goods_arrival_lines_workspace_arrival_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.productId],
      foreignColumns: [products.workspaceId, products.id],
      name: "goods_arrival_lines_workspace_product_fk",
    }),
    foreignKey({
      columns: [table.purchaseId, table.purchaseLineId],
      foreignColumns: [purchaseLines.purchaseId, purchaseLines.id],
      name: "goods_arrival_lines_purchase_line_fk",
    }),
    check(
      "goods_arrival_lines_purchase_link_ck",
      sql`(${table.purchaseId} is null and ${table.purchaseLineId} is null)
        or (${table.purchaseId} is not null and ${table.purchaseLineId} is not null)`,
    ),
    check("goods_arrival_lines_quantity_ck", sql`${table.arrivedValueScaled} > 0`),
    check(
      "goods_arrival_lines_weighing_ck",
      sql`(
        ${table.grossWeightValueScaled} is null and
        ${table.tareWeightValueScaled} is null and
        ${table.netWeightValueScaled} is null and
        ${table.weightUnit} is null
      ) or (
        ${table.grossWeightValueScaled} > 0 and
        ${table.tareWeightValueScaled} >= 0 and
        ${table.netWeightValueScaled} > 0 and
        ${table.grossWeightValueScaled} - ${table.tareWeightValueScaled} = ${table.netWeightValueScaled} and
        ${table.weightUnit} in ('kg', 'gram', 'lang')
      )`,
    ),
    check(
      "goods_arrival_lines_container_ck",
      sql`${table.containerCount} is null or ${table.containerCount} >= 0`,
    ),
  ],
);

export const goodsArrivalReversals = pgTable(
  "goods_arrival_reversals",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    arrivalId: uuid("arrival_id").notNull(),
    reason: text("reason").notNull(),
    evidenceReferences: text("evidence_references").array().notNull().default([]),
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
    foreignKey({
      columns: [table.workspaceId, table.arrivalId],
      foreignColumns: [goodsArrivals.workspaceId, goodsArrivals.id],
      name: "goods_arrival_reversals_workspace_arrival_fk",
    }),
    uniqueIndex("goods_arrival_reversals_arrival_uq").on(table.workspaceId, table.arrivalId),
  ],
);

export const qualityInspections = pgTable(
  "quality_inspections",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    arrivalLineId: uuid("arrival_line_id").notNull(),
    inspectedValueScaled: integer("inspected_value_scaled").notNull(),
    inspectedUnit: unitEnum("inspected_unit").notNull(),
    note: text("note"),
    evidenceReferences: text("evidence_references").array().notNull().default([]),
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
    foreignKey({
      columns: [table.workspaceId, table.arrivalLineId],
      foreignColumns: [goodsArrivalLines.workspaceId, goodsArrivalLines.id],
      name: "quality_inspections_workspace_arrival_line_fk",
    }),
    check("quality_inspections_quantity_ck", sql`${table.inspectedValueScaled} > 0`),
    index("quality_inspections_arrival_line_time_idx").on(
      table.workspaceId,
      table.arrivalLineId,
      table.transactionTime,
      table.recordedAt,
      table.id,
    ),
  ],
);

export const qualityInspectionIssues = pgTable(
  "quality_inspection_issues",
  {
    workspaceId: uuid("workspace_id").notNull(),
    inspectionId: uuid("inspection_id").notNull(),
    qualityIssueCodeId: uuid("quality_issue_code_id").notNull(),
    qualityIssueCode: text("quality_issue_code").notNull(),
    qualityIssueName: text("quality_issue_name").notNull(),
    severity: qualitySeverityEnum("severity").notNull(),
    note: text("note"),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.inspectionId, table.qualityIssueCodeId] }),
    foreignKey({
      columns: [table.workspaceId, table.inspectionId],
      foreignColumns: [qualityInspections.workspaceId, qualityInspections.id],
      name: "quality_inspection_issues_workspace_inspection_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.qualityIssueCodeId],
      foreignColumns: [qualityIssueCodes.workspaceId, qualityIssueCodes.id],
      name: "quality_inspection_issues_workspace_code_fk",
    }),
  ],
);

export const qualityInspectionReversals = pgTable(
  "quality_inspection_reversals",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    inspectionId: uuid("inspection_id").notNull(),
    reason: text("reason").notNull(),
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
    foreignKey({
      columns: [table.workspaceId, table.inspectionId],
      foreignColumns: [qualityInspections.workspaceId, qualityInspections.id],
      name: "quality_inspection_reversals_workspace_inspection_fk",
    }),
    uniqueIndex("quality_inspection_reversals_inspection_uq").on(
      table.workspaceId,
      table.inspectionId,
    ),
  ],
);

export const qualityDispositions = pgTable(
  "quality_dispositions",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    sourceType: qualityDispositionSourceTypeEnum("source_type").notNull(),
    sourceArrivalLineId: uuid("source_arrival_line_id"),
    sourceQuarantineAllocationId: uuid("source_quarantine_allocation_id"),
    note: text("note"),
    evidenceReferences: text("evidence_references").array().notNull().default([]),
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
    foreignKey({
      columns: [table.workspaceId, table.sourceArrivalLineId],
      foreignColumns: [goodsArrivalLines.workspaceId, goodsArrivalLines.id],
      name: "quality_dispositions_workspace_arrival_line_fk",
    }),
    check(
      "quality_dispositions_source_ck",
      sql`(
        ${table.sourceType} = 'arrival_line' and
        ${table.sourceArrivalLineId} is not null and
        ${table.sourceQuarantineAllocationId} is null
      ) or (
        ${table.sourceType} = 'quarantine_allocation' and
        ${table.sourceArrivalLineId} is null and
        ${table.sourceQuarantineAllocationId} is not null
      )`,
    ),
  ],
);

export const qualityDispositionAllocations = pgTable(
  "quality_disposition_allocations",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    dispositionId: uuid("disposition_id").notNull(),
    outcome: qualityDispositionOutcomeEnum("outcome").notNull(),
    valueScaled: integer("value_scaled").notNull(),
    unit: unitEnum("unit").notNull(),
    qualityGradeId: uuid("quality_grade_id"),
    qualityGradeName: text("quality_grade_name"),
    note: text("note"),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId, table.dispositionId],
      foreignColumns: [qualityDispositions.workspaceId, qualityDispositions.id],
      name: "quality_disposition_allocations_workspace_disposition_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.qualityGradeId],
      foreignColumns: [qualityGrades.workspaceId, qualityGrades.id],
      name: "quality_disposition_allocations_workspace_grade_fk",
    }),
    check("quality_disposition_allocations_quantity_ck", sql`${table.valueScaled} > 0`),
    check(
      "quality_disposition_allocations_grade_ck",
      sql`(
        ${table.outcome} = 'accepted' and
        ((${table.qualityGradeId} is null and ${table.qualityGradeName} is null) or
         (${table.qualityGradeId} is not null and ${table.qualityGradeName} is not null))
      ) or (
        ${table.outcome} <> 'accepted' and
        ${table.qualityGradeId} is null and ${table.qualityGradeName} is null
      )`,
    ),
    uniqueIndex("quality_disposition_allocations_workspace_id_uq").on(table.workspaceId, table.id),
  ],
);

export const qualityDispositionReversals = pgTable(
  "quality_disposition_reversals",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    dispositionId: uuid("disposition_id").notNull(),
    reason: text("reason").notNull(),
    evidenceReferences: text("evidence_references").array().notNull().default([]),
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
    foreignKey({
      columns: [table.workspaceId, table.dispositionId],
      foreignColumns: [qualityDispositions.workspaceId, qualityDispositions.id],
      name: "quality_disposition_reversals_workspace_disposition_fk",
    }),
    uniqueIndex("quality_disposition_reversals_disposition_uq").on(
      table.workspaceId,
      table.dispositionId,
    ),
  ],
);
