import { z } from "zod";
import {
  costObservationIdSchema,
  reconciliationObservationIdSchema,
  debtObservationIdSchema,
  workspaceIdSchema,
  actorIdSchema,
  commandIdSchema,
  customerIdSchema,
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
