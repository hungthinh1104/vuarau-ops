import { z } from "zod";
import {
  costObservationIdSchema,
  reconciliationObservationIdSchema,
  debtObservationIdSchema,
  supplyCommitmentObservationIdSchema,
  supplierObservationIdSchema,
  demandObservationIdSchema,
  workspaceIdSchema,
  actorIdSchema,
  commandIdSchema,
  customerIdSchema,
  supplierIdSchema,
  productIdSchema,
  qualityGradeIdSchema,
} from "../shared/ids.ts";
import { defineCommand } from "../shared/command.ts";
import { evidenceReferenceSchema } from "../shared/evidence.ts";
import { moneySchema } from "../shared/money.ts";
import { quantitySchema } from "../shared/quantity.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { pageOf, pageRequestSchema } from "../shared/pagination.ts";

/**
 * Raw cost/loss observations are evidence, not a valuation decision. A recorded
 * amount or quantity is preserved exactly as observed and never becomes COGS,
 * profit, payable or inventory state by this command.
 */
export const COST_OBSERVATION_KINDS = [
  "purchase_price",
  "accepted_quantity",
  "rejected_quantity",
  "packing_material",
  "labor_handling",
  "transport",
  "spoilage",
  "damage",
  "customer_return",
  "supplier_claim",
  "supplier_credit",
  "other",
] as const;
export const costObservationKindSchema = z.enum(COST_OBSERVATION_KINDS);
export type CostObservationKind = z.infer<typeof costObservationKindSchema>;

export const COST_OBSERVATION_CASE_KINDS = [
  "normal",
  "partial_or_exception",
  "correction",
] as const;
export const costObservationCaseKindSchema = z.enum(COST_OBSERVATION_CASE_KINDS);
export type CostObservationCaseKind = z.infer<typeof costObservationCaseKindSchema>;

export const costObservationFactsSchema = z.object({
  amount: moneySchema.nullable().default(null),
  quantity: quantitySchema.nullable().default(null),
  productId: productIdSchema.nullable().default(null),
  qualityGradeId: qualityGradeIdSchema.nullable().default(null),
  sourceReference: z.string().trim().max(500).nullable().default(null),
});
export type CostObservationFacts = z.infer<typeof costObservationFactsSchema>;

const costObservationPayloadSchema = z.object({
  costObservationId: costObservationIdSchema,
  kind: costObservationKindSchema,
  caseKind: costObservationCaseKindSchema,
  description: z.string().trim().min(1).max(2_000),
  participantWording: z.string().trim().min(1).max(2_000),
  facts: costObservationFactsSchema,
  /** At least one source reference is required for a raw observation. */
  evidenceReferences: z.array(evidenceReferenceSchema).min(1).max(20),
  /** A correction is a new immutable observation linked to the prior one. */
  relatedObservationId: costObservationIdSchema.nullable().default(null),
});

export const recordCostObservationCommandSchema = defineCommand(costObservationPayloadSchema);
export type RecordCostObservationCommand = z.infer<typeof recordCostObservationCommandSchema>;

export const costObservationDtoSchema = z.object({
  id: costObservationIdSchema,
  workspaceId: workspaceIdSchema,
  kind: costObservationKindSchema,
  caseKind: costObservationCaseKindSchema,
  description: z.string(),
  participantWording: z.string(),
  facts: costObservationFactsSchema,
  evidenceReferences: z.array(z.string()),
  relatedObservationId: costObservationIdSchema.nullable(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
});
export type CostObservationDto = z.infer<typeof costObservationDtoSchema>;

export const costObservationGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  costObservationId: costObservationIdSchema,
});
export type CostObservationGetInput = z.infer<typeof costObservationGetInputSchema>;

export const costObservationListInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  kind: costObservationKindSchema.nullable().default(null),
});
export type CostObservationListInput = z.infer<typeof costObservationListInputSchema>;
export const costObservationPageSchema = pageOf(costObservationDtoSchema);

export const RECONCILIATION_OBSERVATION_KINDS = [
  "cash_count",
  "inventory_count",
  "order_outstanding",
  "delivery_outstanding",
  "return_outstanding",
  "claim_outstanding",
  "packing_discrepancy",
  "bank_statement_match",
  "other",
] as const;
export const reconciliationObservationKindSchema = z.enum(RECONCILIATION_OBSERVATION_KINDS);
export type ReconciliationObservationKind = z.infer<typeof reconciliationObservationKindSchema>;

/**
 * Reconciliation facts are observations of expected/observed values. They do
 * not calculate a variance or approve a close; the same source may be missing
 * one or both sides until a worker can verify it.
 */
export const reconciliationObservationFactsSchema = z.object({
  expectedAmount: moneySchema.nullable().default(null),
  observedAmount: moneySchema.nullable().default(null),
  expectedQuantity: quantitySchema.nullable().default(null),
  observedQuantity: quantitySchema.nullable().default(null),
  itemCount: z.int().nonnegative().nullable().default(null),
  productId: productIdSchema.nullable().default(null),
  qualityGradeId: qualityGradeIdSchema.nullable().default(null),
  scopeReference: z.string().trim().max(500).nullable().default(null),
});
export type ReconciliationObservationFacts = z.infer<typeof reconciliationObservationFactsSchema>;

const reconciliationObservationPayloadSchema = z.object({
  reconciliationObservationId: reconciliationObservationIdSchema,
  kind: reconciliationObservationKindSchema,
  caseKind: costObservationCaseKindSchema,
  description: z.string().trim().min(1).max(2_000),
  participantWording: z.string().trim().min(1).max(2_000),
  facts: reconciliationObservationFactsSchema,
  evidenceReferences: z.array(evidenceReferenceSchema).min(1).max(20),
  relatedObservationId: reconciliationObservationIdSchema.nullable().default(null),
});

export const recordReconciliationObservationCommandSchema = defineCommand(
  reconciliationObservationPayloadSchema,
);
export type RecordReconciliationObservationCommand = z.infer<
  typeof recordReconciliationObservationCommandSchema
>;

export const reconciliationObservationDtoSchema = z.object({
  id: reconciliationObservationIdSchema,
  workspaceId: workspaceIdSchema,
  kind: reconciliationObservationKindSchema,
  caseKind: costObservationCaseKindSchema,
  description: z.string(),
  participantWording: z.string(),
  facts: reconciliationObservationFactsSchema,
  evidenceReferences: z.array(z.string()),
  relatedObservationId: reconciliationObservationIdSchema.nullable(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
});
export type ReconciliationObservationDto = z.infer<typeof reconciliationObservationDtoSchema>;

export const reconciliationObservationGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  reconciliationObservationId: reconciliationObservationIdSchema,
});
export type ReconciliationObservationGetInput = z.infer<
  typeof reconciliationObservationGetInputSchema
>;

export const reconciliationObservationListInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  kind: reconciliationObservationKindSchema.nullable().default(null),
});
export type ReconciliationObservationListInput = z.infer<
  typeof reconciliationObservationListInputSchema
>;
export const reconciliationObservationPageSchema = pageOf(reconciliationObservationDtoSchema);

/**
 * Debt observations preserve what a participant agreed, promised or referenced
 * without declaring a sale overdue, allocating a payment or changing a ledger.
 */
export const DEBT_OBSERVATION_KINDS = [
  "agreed_due_date",
  "payment_term",
  "promise_to_pay",
  "collection_note",
  "payment_reference",
  "allocation_proposal",
  "other",
] as const;
export const debtObservationKindSchema = z.enum(DEBT_OBSERVATION_KINDS);
export type DebtObservationKind = z.infer<typeof debtObservationKindSchema>;

export const debtObservationFactsSchema = z.object({
  amount: moneySchema.nullable().default(null),
  agreedDueAt: isoInstantSchema.nullable().default(null),
  promiseToPayAt: isoInstantSchema.nullable().default(null),
  termCode: z.string().trim().max(100).nullable().default(null),
  termText: z.string().trim().max(1_000).nullable().default(null),
  paymentReference: z.string().trim().max(500).nullable().default(null),
  allocationProposal: z.string().trim().max(1_000).nullable().default(null),
  customerId: customerIdSchema.nullable().default(null),
});
export type DebtObservationFacts = z.infer<typeof debtObservationFactsSchema>;

const debtObservationPayloadSchema = z.object({
  debtObservationId: debtObservationIdSchema,
  kind: debtObservationKindSchema,
  caseKind: costObservationCaseKindSchema,
  description: z.string().trim().min(1).max(2_000),
  participantWording: z.string().trim().min(1).max(2_000),
  facts: debtObservationFactsSchema,
  evidenceReferences: z.array(evidenceReferenceSchema).min(1).max(20),
  relatedObservationId: debtObservationIdSchema.nullable().default(null),
});

export const recordDebtObservationCommandSchema = defineCommand(debtObservationPayloadSchema);
export type RecordDebtObservationCommand = z.infer<typeof recordDebtObservationCommandSchema>;

export const debtObservationDtoSchema = z.object({
  id: debtObservationIdSchema,
  workspaceId: workspaceIdSchema,
  kind: debtObservationKindSchema,
  caseKind: costObservationCaseKindSchema,
  description: z.string(),
  participantWording: z.string(),
  facts: debtObservationFactsSchema,
  evidenceReferences: z.array(z.string()),
  relatedObservationId: debtObservationIdSchema.nullable(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
});
export type DebtObservationDto = z.infer<typeof debtObservationDtoSchema>;

export const debtObservationGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  debtObservationId: debtObservationIdSchema,
});
export type DebtObservationGetInput = z.infer<typeof debtObservationGetInputSchema>;

export const debtObservationListInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  kind: debtObservationKindSchema.nullable().default(null),
});
export type DebtObservationListInput = z.infer<typeof debtObservationListInputSchema>;
export const debtObservationPageSchema = pageOf(debtObservationDtoSchema);

/**
 * Supply commitments preserve what a supplier, farmer or collector said was
 * available or expected. They are raw source facts only: they do not create a
 * purchase, payable, receipt, inventory movement, reorder signal or supplier
 * score. A free-text counterparty label keeps capture possible before a
 * supplier master record exists; a known supplierId is optional and scoped by
 * the command workspace.
 */
export const SUPPLY_COMMITMENT_OBSERVATION_KINDS = [
  "promised_supply",
  "expected_arrival",
  "minimum_order",
  "availability_note",
  "other",
] as const;
export const supplyCommitmentObservationKindSchema = z.enum(SUPPLY_COMMITMENT_OBSERVATION_KINDS);
export type SupplyCommitmentObservationKind = z.infer<typeof supplyCommitmentObservationKindSchema>;

export const supplyCommitmentObservationFactsSchema = z.object({
  supplierId: supplierIdSchema.nullable().default(null),
  productId: productIdSchema.nullable().default(null),
  qualityGradeId: qualityGradeIdSchema.nullable().default(null),
  promisedQuantity: quantitySchema.nullable().default(null),
  minimumOrder: quantitySchema.nullable().default(null),
  expectedArrivalAt: isoInstantSchema.nullable().default(null),
  counterpartyLabel: z.string().trim().max(500).nullable().default(null),
  commitmentReference: z.string().trim().max(500).nullable().default(null),
});
export type SupplyCommitmentObservationFacts = z.infer<
  typeof supplyCommitmentObservationFactsSchema
>;

const supplyCommitmentObservationPayloadSchema = z.object({
  supplyCommitmentObservationId: supplyCommitmentObservationIdSchema,
  kind: supplyCommitmentObservationKindSchema,
  caseKind: costObservationCaseKindSchema,
  description: z.string().trim().min(1).max(2_000),
  participantWording: z.string().trim().min(1).max(2_000),
  facts: supplyCommitmentObservationFactsSchema,
  evidenceReferences: z.array(evidenceReferenceSchema).min(1).max(20),
  relatedObservationId: supplyCommitmentObservationIdSchema.nullable().default(null),
});

export const recordSupplyCommitmentObservationCommandSchema = defineCommand(
  supplyCommitmentObservationPayloadSchema,
);
export type RecordSupplyCommitmentObservationCommand = z.infer<
  typeof recordSupplyCommitmentObservationCommandSchema
>;

export const supplyCommitmentObservationDtoSchema = z.object({
  id: supplyCommitmentObservationIdSchema,
  workspaceId: workspaceIdSchema,
  kind: supplyCommitmentObservationKindSchema,
  caseKind: costObservationCaseKindSchema,
  description: z.string(),
  participantWording: z.string(),
  facts: supplyCommitmentObservationFactsSchema,
  evidenceReferences: z.array(z.string()),
  relatedObservationId: supplyCommitmentObservationIdSchema.nullable(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
});
export type SupplyCommitmentObservationDto = z.infer<typeof supplyCommitmentObservationDtoSchema>;

export const supplyCommitmentObservationGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  supplyCommitmentObservationId: supplyCommitmentObservationIdSchema,
});
export type SupplyCommitmentObservationGetInput = z.infer<
  typeof supplyCommitmentObservationGetInputSchema
>;

export const supplyCommitmentObservationListInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  kind: supplyCommitmentObservationKindSchema.nullable().default(null),
});
export type SupplyCommitmentObservationListInput = z.infer<
  typeof supplyCommitmentObservationListInputSchema
>;
export const supplyCommitmentObservationPageSchema = pageOf(supplyCommitmentObservationDtoSchema);

/**
 * Supplier relationship and performance observations preserve what a worker,
 * supplier or owner said or observed. They do not create a supplier role,
 * payable, inventory movement, claim settlement, score or recommendation.
 */
export const SUPPLIER_OBSERVATION_KINDS = [
  "role",
  "product_supplied",
  "source_area",
  "pickup_responsibility",
  "packing_responsibility",
  "transport_responsibility",
  "expected_lead_time",
  "payment_arrangement",
  "traceability_level",
  "promised_quantity",
  "actual_quantity",
  "expected_arrival",
  "actual_arrival",
  "accepted_quantity",
  "rejected_quantity",
  "claim",
  "price",
  "other",
] as const;
export const supplierObservationKindSchema = z.enum(SUPPLIER_OBSERVATION_KINDS);
export type SupplierObservationKind = z.infer<typeof supplierObservationKindSchema>;

export const supplierObservationFactsSchema = z.object({
  supplierId: supplierIdSchema.nullable().default(null),
  productId: productIdSchema.nullable().default(null),
  qualityGradeId: qualityGradeIdSchema.nullable().default(null),
  supplierObservationGroupId: z.uuid().nullable().default(null),
  role: z.string().trim().max(200).nullable().default(null),
  sourceArea: z.string().trim().max(500).nullable().default(null),
  pickupResponsibility: z.string().trim().max(500).nullable().default(null),
  packingResponsibility: z.string().trim().max(500).nullable().default(null),
  transportResponsibility: z.string().trim().max(500).nullable().default(null),
  expectedLeadTimeText: z.string().trim().max(500).nullable().default(null),
  paymentArrangement: z.string().trim().max(1_000).nullable().default(null),
  traceabilityLevel: z.string().trim().max(200).nullable().default(null),
  promisedQuantity: quantitySchema.nullable().default(null),
  actualQuantity: quantitySchema.nullable().default(null),
  acceptedQuantity: quantitySchema.nullable().default(null),
  rejectedQuantity: quantitySchema.nullable().default(null),
  expectedAt: isoInstantSchema.nullable().default(null),
  actualAt: isoInstantSchema.nullable().default(null),
  price: moneySchema.nullable().default(null),
  claimReference: z.string().trim().max(500).nullable().default(null),
  observationReference: z.string().trim().max(500).nullable().default(null),
});
export type SupplierObservationFacts = z.infer<typeof supplierObservationFactsSchema>;

const supplierObservationPayloadSchema = z.object({
  supplierObservationId: supplierObservationIdSchema,
  kind: supplierObservationKindSchema,
  caseKind: costObservationCaseKindSchema,
  description: z.string().trim().min(1).max(2_000),
  participantWording: z.string().trim().min(1).max(2_000),
  facts: supplierObservationFactsSchema,
  evidenceReferences: z.array(evidenceReferenceSchema).min(1).max(20),
  relatedObservationId: supplierObservationIdSchema.nullable().default(null),
});

export const recordSupplierObservationCommandSchema = defineCommand(
  supplierObservationPayloadSchema,
);
export type RecordSupplierObservationCommand = z.infer<
  typeof recordSupplierObservationCommandSchema
>;

export const supplierObservationDtoSchema = z.object({
  id: supplierObservationIdSchema,
  workspaceId: workspaceIdSchema,
  kind: supplierObservationKindSchema,
  caseKind: costObservationCaseKindSchema,
  description: z.string(),
  participantWording: z.string(),
  facts: supplierObservationFactsSchema,
  evidenceReferences: z.array(z.string()),
  relatedObservationId: supplierObservationIdSchema.nullable(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
});
export type SupplierObservationDto = z.infer<typeof supplierObservationDtoSchema>;

export const supplierObservationGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  supplierObservationId: supplierObservationIdSchema,
});
export type SupplierObservationGetInput = z.infer<typeof supplierObservationGetInputSchema>;

export const supplierObservationListInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  kind: supplierObservationKindSchema.nullable().default(null),
});
export type SupplierObservationListInput = z.infer<typeof supplierObservationListInputSchema>;
export const supplierObservationPageSchema = pageOf(supplierObservationDtoSchema);

/**
 * Customer demand/order observations preserve a request before it becomes a
 * Sale. They are source facts only: no Sale, allocation, stock shortage,
 * forecast, reorder signal or customer-debt effect is created here.
 */
export const DEMAND_OBSERVATION_KINDS = [
  "requested_order",
  "expected_delivery",
  "minimum_quantity",
  "availability_note",
  "other",
] as const;
export const demandObservationKindSchema = z.enum(DEMAND_OBSERVATION_KINDS);
export type DemandObservationKind = z.infer<typeof demandObservationKindSchema>;

export const demandObservationFactsSchema = z.object({
  customerId: customerIdSchema.nullable().default(null),
  productId: productIdSchema.nullable().default(null),
  qualityGradeId: qualityGradeIdSchema.nullable().default(null),
  requestedQuantity: quantitySchema.nullable().default(null),
  minimumQuantity: quantitySchema.nullable().default(null),
  requestedForAt: isoInstantSchema.nullable().default(null),
  counterpartyLabel: z.string().trim().max(500).nullable().default(null),
  demandReference: z.string().trim().max(500).nullable().default(null),
});
export type DemandObservationFacts = z.infer<typeof demandObservationFactsSchema>;

const demandObservationPayloadSchema = z.object({
  demandObservationId: demandObservationIdSchema,
  kind: demandObservationKindSchema,
  caseKind: costObservationCaseKindSchema,
  description: z.string().trim().min(1).max(2_000),
  participantWording: z.string().trim().min(1).max(2_000),
  facts: demandObservationFactsSchema,
  evidenceReferences: z.array(evidenceReferenceSchema).min(1).max(20),
  relatedObservationId: demandObservationIdSchema.nullable().default(null),
});

export const recordDemandObservationCommandSchema = defineCommand(demandObservationPayloadSchema);
export type RecordDemandObservationCommand = z.infer<typeof recordDemandObservationCommandSchema>;

export const demandObservationDtoSchema = z.object({
  id: demandObservationIdSchema,
  workspaceId: workspaceIdSchema,
  kind: demandObservationKindSchema,
  caseKind: costObservationCaseKindSchema,
  description: z.string(),
  participantWording: z.string(),
  facts: demandObservationFactsSchema,
  evidenceReferences: z.array(z.string()),
  relatedObservationId: demandObservationIdSchema.nullable(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
});
export type DemandObservationDto = z.infer<typeof demandObservationDtoSchema>;

export const demandObservationGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  demandObservationId: demandObservationIdSchema,
});
export type DemandObservationGetInput = z.infer<typeof demandObservationGetInputSchema>;

export const demandObservationListInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  kind: demandObservationKindSchema.nullable().default(null),
});
export type DemandObservationListInput = z.infer<typeof demandObservationListInputSchema>;
export const demandObservationPageSchema = pageOf(demandObservationDtoSchema);
