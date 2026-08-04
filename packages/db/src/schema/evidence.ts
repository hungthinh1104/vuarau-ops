import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  costObservationCaseKindEnum,
  costObservationKindEnum,
  reconciliationObservationKindEnum,
  debtObservationKindEnum,
  supplyCommitmentObservationKindEnum,
  supplierObservationKindEnum,
  demandObservationKindEnum,
  currencyCodeEnum,
  unitEnum,
} from "./enums.ts";
import { commandReceipts } from "./command.ts";
import { customers, products } from "./customer.ts";
import { qualityGrades } from "./quality.ts";
import { actors, workspaces } from "./workspace.ts";
import { suppliers } from "./supplier.ts";

/**
 * Source-linked cost/loss observations. This table is append-only evidence and
 * intentionally has no foreign key to a ledger, inventory movement or payable.
 */
export const costObservations = pgTable(
  "cost_observations",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    kind: costObservationKindEnum("kind").notNull(),
    caseKind: costObservationCaseKindEnum("case_kind").notNull(),
    description: text("description").notNull(),
    participantWording: text("participant_wording").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    amountCurrency: currencyCodeEnum("amount_currency"),
    quantityScaled: bigint("quantity_scaled", { mode: "number" }),
    quantityUnit: unitEnum("quantity_unit"),
    productId: uuid("product_id"),
    qualityGradeId: uuid("quality_grade_id"),
    sourceReference: text("source_reference"),
    evidenceReferences: text("evidence_references").array().notNull(),
    relatedObservationId: uuid("related_observation_id"),
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
    index("cost_observations_workspace_time_idx").on(table.workspaceId, table.recordedAt, table.id),
    index("cost_observations_workspace_kind_idx").on(
      table.workspaceId,
      table.kind,
      table.recordedAt,
      table.id,
    ),
    foreignKey({
      columns: [table.workspaceId, table.productId],
      foreignColumns: [products.workspaceId, products.id],
      name: "cost_observations_workspace_product_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.qualityGradeId],
      foreignColumns: [qualityGrades.workspaceId, qualityGrades.id],
      name: "cost_observations_workspace_grade_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.relatedObservationId],
      foreignColumns: [table.workspaceId, table.id],
      name: "cost_observations_workspace_related_fk",
    }),
    check(
      "cost_observations_amount_pair_ck",
      sql`(${table.amountMinor} is null and ${table.amountCurrency} is null)
        or (${table.amountMinor} is not null and ${table.amountCurrency} is not null)`,
    ),
    check(
      "cost_observations_quantity_pair_ck",
      sql`(${table.quantityScaled} is null and ${table.quantityUnit} is null)
        or (${table.quantityScaled} is not null and ${table.quantityUnit} is not null)`,
    ),
    check(
      "cost_observations_correction_link_ck",
      sql`(${table.caseKind} = 'correction' and ${table.relatedObservationId} is not null)
        or (${table.caseKind} <> 'correction' and ${table.relatedObservationId} is null)`,
    ),
  ],
);

/** Source-linked reconciliation observations; no close, balance or variance effect. */
export const reconciliationObservations = pgTable(
  "reconciliation_observations",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    kind: reconciliationObservationKindEnum("kind").notNull(),
    caseKind: costObservationCaseKindEnum("case_kind").notNull(),
    description: text("description").notNull(),
    participantWording: text("participant_wording").notNull(),
    expectedAmountMinor: bigint("expected_amount_minor", { mode: "number" }),
    expectedAmountCurrency: currencyCodeEnum("expected_amount_currency"),
    observedAmountMinor: bigint("observed_amount_minor", { mode: "number" }),
    observedAmountCurrency: currencyCodeEnum("observed_amount_currency"),
    expectedQuantityScaled: bigint("expected_quantity_scaled", { mode: "number" }),
    expectedQuantityUnit: unitEnum("expected_quantity_unit"),
    observedQuantityScaled: bigint("observed_quantity_scaled", { mode: "number" }),
    observedQuantityUnit: unitEnum("observed_quantity_unit"),
    itemCount: bigint("item_count", { mode: "number" }),
    productId: uuid("product_id"),
    qualityGradeId: uuid("quality_grade_id"),
    scopeReference: text("scope_reference"),
    evidenceReferences: text("evidence_references").array().notNull(),
    relatedObservationId: uuid("related_observation_id"),
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
    index("reconciliation_observations_workspace_time_idx").on(
      table.workspaceId,
      table.recordedAt,
      table.id,
    ),
    index("reconciliation_observations_workspace_kind_idx").on(
      table.workspaceId,
      table.kind,
      table.recordedAt,
      table.id,
    ),
    foreignKey({
      columns: [table.workspaceId, table.productId],
      foreignColumns: [products.workspaceId, products.id],
      name: "reconciliation_observations_workspace_product_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.qualityGradeId],
      foreignColumns: [qualityGrades.workspaceId, qualityGrades.id],
      name: "reconciliation_observations_workspace_grade_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.relatedObservationId],
      foreignColumns: [table.workspaceId, table.id],
      name: "reconciliation_observations_workspace_related_fk",
    }),
    check(
      "reconciliation_observations_expected_amount_pair_ck",
      sql`(${table.expectedAmountMinor} is null and ${table.expectedAmountCurrency} is null)
        or (${table.expectedAmountMinor} is not null and ${table.expectedAmountCurrency} is not null)`,
    ),
    check(
      "reconciliation_observations_observed_amount_pair_ck",
      sql`(${table.observedAmountMinor} is null and ${table.observedAmountCurrency} is null)
        or (${table.observedAmountMinor} is not null and ${table.observedAmountCurrency} is not null)`,
    ),
    check(
      "reconciliation_observations_expected_quantity_pair_ck",
      sql`(${table.expectedQuantityScaled} is null and ${table.expectedQuantityUnit} is null)
        or (${table.expectedQuantityScaled} is not null and ${table.expectedQuantityUnit} is not null)`,
    ),
    check(
      "reconciliation_observations_observed_quantity_pair_ck",
      sql`(${table.observedQuantityScaled} is null and ${table.observedQuantityUnit} is null)
        or (${table.observedQuantityScaled} is not null and ${table.observedQuantityUnit} is not null)`,
    ),
    check(
      "reconciliation_observations_item_count_ck",
      sql`${table.itemCount} is null or ${table.itemCount} >= 0`,
    ),
    check(
      "reconciliation_observations_correction_link_ck",
      sql`(${table.caseKind} = 'correction' and ${table.relatedObservationId} is not null)
        or (${table.caseKind} <> 'correction' and ${table.relatedObservationId} is null)`,
    ),
  ],
);

/** Source-linked payment-term/debt observations; no overdue or ledger effect. */
export const debtObservations = pgTable(
  "debt_observations",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    kind: debtObservationKindEnum("kind").notNull(),
    caseKind: costObservationCaseKindEnum("case_kind").notNull(),
    description: text("description").notNull(),
    participantWording: text("participant_wording").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    amountCurrency: currencyCodeEnum("amount_currency"),
    agreedDueAt: timestamp("agreed_due_at", { withTimezone: true }),
    promiseToPayAt: timestamp("promise_to_pay_at", { withTimezone: true }),
    termCode: text("term_code"),
    termText: text("term_text"),
    paymentReference: text("payment_reference"),
    allocationProposal: text("allocation_proposal"),
    customerId: uuid("customer_id"),
    evidenceReferences: text("evidence_references").array().notNull(),
    relatedObservationId: uuid("related_observation_id"),
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
    index("debt_observations_workspace_time_idx").on(table.workspaceId, table.recordedAt, table.id),
    index("debt_observations_workspace_kind_idx").on(
      table.workspaceId,
      table.kind,
      table.recordedAt,
      table.id,
    ),
    foreignKey({
      columns: [table.workspaceId, table.customerId],
      foreignColumns: [customers.workspaceId, customers.id],
      name: "debt_observations_workspace_customer_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.relatedObservationId],
      foreignColumns: [table.workspaceId, table.id],
      name: "debt_observations_workspace_related_fk",
    }),
    check(
      "debt_observations_amount_pair_ck",
      sql`(${table.amountMinor} is null and ${table.amountCurrency} is null)
        or (${table.amountMinor} is not null and ${table.amountCurrency} is not null)`,
    ),
    check(
      "debt_observations_correction_link_ck",
      sql`(${table.caseKind} = 'correction' and ${table.relatedObservationId} is not null)
        or (${table.caseKind} <> 'correction' and ${table.relatedObservationId} is null)`,
    ),
  ],
);

/** Source-linked supplier/farmer supply commitments; no payable or inventory effect. */
export const supplyCommitmentObservations = pgTable(
  "supply_commitment_observations",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    kind: supplyCommitmentObservationKindEnum("kind").notNull(),
    caseKind: costObservationCaseKindEnum("case_kind").notNull(),
    description: text("description").notNull(),
    participantWording: text("participant_wording").notNull(),
    supplierId: uuid("supplier_id"),
    productId: uuid("product_id"),
    qualityGradeId: uuid("quality_grade_id"),
    promisedQuantityScaled: bigint("promised_quantity_scaled", { mode: "number" }),
    promisedQuantityUnit: unitEnum("promised_quantity_unit"),
    minimumOrderScaled: bigint("minimum_order_scaled", { mode: "number" }),
    minimumOrderUnit: unitEnum("minimum_order_unit"),
    expectedArrivalAt: timestamp("expected_arrival_at", { withTimezone: true }),
    counterpartyLabel: text("counterparty_label"),
    commitmentReference: text("commitment_reference"),
    evidenceReferences: text("evidence_references").array().notNull(),
    relatedObservationId: uuid("related_observation_id"),
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
    index("supply_commitment_observations_workspace_time_idx").on(
      table.workspaceId,
      table.recordedAt,
      table.id,
    ),
    index("supply_commitment_observations_workspace_kind_idx").on(
      table.workspaceId,
      table.kind,
      table.recordedAt,
      table.id,
    ),
    foreignKey({
      columns: [table.workspaceId, table.supplierId],
      foreignColumns: [suppliers.workspaceId, suppliers.id],
      name: "supply_commitment_observations_workspace_supplier_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.productId],
      foreignColumns: [products.workspaceId, products.id],
      name: "supply_commitment_observations_workspace_product_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.qualityGradeId],
      foreignColumns: [qualityGrades.workspaceId, qualityGrades.id],
      name: "supply_commitment_observations_workspace_grade_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.relatedObservationId],
      foreignColumns: [table.workspaceId, table.id],
      name: "supply_commitment_observations_workspace_related_fk",
    }),
    check(
      "supply_commitment_observations_promised_quantity_pair_ck",
      sql`(${table.promisedQuantityScaled} is null and ${table.promisedQuantityUnit} is null)
        or (${table.promisedQuantityScaled} is not null and ${table.promisedQuantityUnit} is not null)`,
    ),
    check(
      "supply_commitment_observations_minimum_order_pair_ck",
      sql`(${table.minimumOrderScaled} is null and ${table.minimumOrderUnit} is null)
        or (${table.minimumOrderScaled} is not null and ${table.minimumOrderUnit} is not null)`,
    ),
    check(
      "supply_commitment_observations_correction_link_ck",
      sql`(${table.caseKind} = 'correction' and ${table.relatedObservationId} is not null)
        or (${table.caseKind} <> 'correction' and ${table.relatedObservationId} is null)`,
    ),
  ],
);

/** Source-linked supplier relationship/performance facts; no score or effect. */
export const supplierObservations = pgTable(
  "supplier_observations",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    kind: supplierObservationKindEnum("kind").notNull(),
    caseKind: costObservationCaseKindEnum("case_kind").notNull(),
    description: text("description").notNull(),
    participantWording: text("participant_wording").notNull(),
    supplierId: uuid("supplier_id"),
    productId: uuid("product_id"),
    qualityGradeId: uuid("quality_grade_id"),
    supplierObservationGroupId: uuid("supplier_observation_group_id"),
    role: text("role"),
    sourceArea: text("source_area"),
    pickupResponsibility: text("pickup_responsibility"),
    packingResponsibility: text("packing_responsibility"),
    transportResponsibility: text("transport_responsibility"),
    expectedLeadTimeText: text("expected_lead_time_text"),
    paymentArrangement: text("payment_arrangement"),
    traceabilityLevel: text("traceability_level"),
    promisedQuantityScaled: bigint("promised_quantity_scaled", { mode: "number" }),
    promisedQuantityUnit: unitEnum("promised_quantity_unit"),
    actualQuantityScaled: bigint("actual_quantity_scaled", { mode: "number" }),
    actualQuantityUnit: unitEnum("actual_quantity_unit"),
    acceptedQuantityScaled: bigint("accepted_quantity_scaled", { mode: "number" }),
    acceptedQuantityUnit: unitEnum("accepted_quantity_unit"),
    rejectedQuantityScaled: bigint("rejected_quantity_scaled", { mode: "number" }),
    rejectedQuantityUnit: unitEnum("rejected_quantity_unit"),
    expectedAt: timestamp("expected_at", { withTimezone: true }),
    actualAt: timestamp("actual_at", { withTimezone: true }),
    priceMinor: bigint("price_minor", { mode: "number" }),
    priceCurrency: currencyCodeEnum("price_currency"),
    claimReference: text("claim_reference"),
    observationReference: text("observation_reference"),
    evidenceReferences: text("evidence_references").array().notNull(),
    relatedObservationId: uuid("related_observation_id"),
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
    index("supplier_observations_workspace_time_idx").on(
      table.workspaceId,
      table.recordedAt,
      table.id,
    ),
    index("supplier_observations_workspace_kind_idx").on(
      table.workspaceId,
      table.kind,
      table.recordedAt,
      table.id,
    ),
    foreignKey({
      columns: [table.workspaceId, table.supplierId],
      foreignColumns: [suppliers.workspaceId, suppliers.id],
      name: "supplier_observations_workspace_supplier_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.productId],
      foreignColumns: [products.workspaceId, products.id],
      name: "supplier_observations_workspace_product_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.qualityGradeId],
      foreignColumns: [qualityGrades.workspaceId, qualityGrades.id],
      name: "supplier_observations_workspace_grade_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.relatedObservationId],
      foreignColumns: [table.workspaceId, table.id],
      name: "supplier_observations_workspace_related_fk",
    }),
    check(
      "supplier_observations_promised_quantity_pair_ck",
      sql`(${table.promisedQuantityScaled} is null and ${table.promisedQuantityUnit} is null)
        or (${table.promisedQuantityScaled} is not null and ${table.promisedQuantityUnit} is not null)`,
    ),
    check(
      "supplier_observations_actual_quantity_pair_ck",
      sql`(${table.actualQuantityScaled} is null and ${table.actualQuantityUnit} is null)
        or (${table.actualQuantityScaled} is not null and ${table.actualQuantityUnit} is not null)`,
    ),
    check(
      "supplier_observations_accepted_quantity_pair_ck",
      sql`(${table.acceptedQuantityScaled} is null and ${table.acceptedQuantityUnit} is null)
        or (${table.acceptedQuantityScaled} is not null and ${table.acceptedQuantityUnit} is not null)`,
    ),
    check(
      "supplier_observations_rejected_quantity_pair_ck",
      sql`(${table.rejectedQuantityScaled} is null and ${table.rejectedQuantityUnit} is null)
        or (${table.rejectedQuantityScaled} is not null and ${table.rejectedQuantityUnit} is not null)`,
    ),
    check(
      "supplier_observations_price_pair_ck",
      sql`(${table.priceMinor} is null and ${table.priceCurrency} is null)
        or (${table.priceMinor} is not null and ${table.priceCurrency} is not null)`,
    ),
    check(
      "supplier_observations_correction_link_ck",
      sql`(${table.caseKind} = 'correction' and ${table.relatedObservationId} is not null)
        or (${table.caseKind} <> 'correction' and ${table.relatedObservationId} is null)`,
    ),
  ],
);

/** Source-linked customer demand/order facts; no Sale, forecast or reorder effect. */
export const demandObservations = pgTable(
  "demand_observations",
  {
    id: uuid("id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    kind: demandObservationKindEnum("kind").notNull(),
    caseKind: costObservationCaseKindEnum("case_kind").notNull(),
    description: text("description").notNull(),
    participantWording: text("participant_wording").notNull(),
    customerId: uuid("customer_id"),
    productId: uuid("product_id"),
    qualityGradeId: uuid("quality_grade_id"),
    requestedQuantityScaled: bigint("requested_quantity_scaled", { mode: "number" }),
    requestedQuantityUnit: unitEnum("requested_quantity_unit"),
    minimumQuantityScaled: bigint("minimum_quantity_scaled", { mode: "number" }),
    minimumQuantityUnit: unitEnum("minimum_quantity_unit"),
    requestedForAt: timestamp("requested_for_at", { withTimezone: true }),
    counterpartyLabel: text("counterparty_label"),
    demandReference: text("demand_reference"),
    evidenceReferences: text("evidence_references").array().notNull(),
    relatedObservationId: uuid("related_observation_id"),
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
    index("demand_observations_workspace_time_idx").on(
      table.workspaceId,
      table.recordedAt,
      table.id,
    ),
    index("demand_observations_workspace_kind_idx").on(
      table.workspaceId,
      table.kind,
      table.recordedAt,
      table.id,
    ),
    foreignKey({
      columns: [table.workspaceId, table.customerId],
      foreignColumns: [customers.workspaceId, customers.id],
      name: "demand_observations_workspace_customer_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.productId],
      foreignColumns: [products.workspaceId, products.id],
      name: "demand_observations_workspace_product_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.qualityGradeId],
      foreignColumns: [qualityGrades.workspaceId, qualityGrades.id],
      name: "demand_observations_workspace_grade_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.relatedObservationId],
      foreignColumns: [table.workspaceId, table.id],
      name: "demand_observations_workspace_related_fk",
    }),
    check(
      "demand_observations_requested_quantity_pair_ck",
      sql`(${table.requestedQuantityScaled} is null and ${table.requestedQuantityUnit} is null)
        or (${table.requestedQuantityScaled} is not null and ${table.requestedQuantityUnit} is not null)`,
    ),
    check(
      "demand_observations_minimum_quantity_pair_ck",
      sql`(${table.minimumQuantityScaled} is null and ${table.minimumQuantityUnit} is null)
        or (${table.minimumQuantityScaled} is not null and ${table.minimumQuantityUnit} is not null)`,
    ),
    check(
      "demand_observations_correction_link_ck",
      sql`(${table.caseKind} = 'correction' and ${table.relatedObservationId} is not null)
        or (${table.caseKind} <> 'correction' and ${table.relatedObservationId} is null)`,
    ),
  ],
);
