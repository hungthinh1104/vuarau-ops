import { z } from "zod";
import {
  actorIdSchema,
  auditRecordIdSchema,
  commandIdSchema,
  saleIdSchema,
  workspaceIdSchema,
} from "../shared/ids.ts";
import { pageRequestSchema } from "../shared/pagination.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { domainRejectionCodeSchema } from "../shared/rejection-codes.ts";

/**
 * Audit answers "who did what business action, and why" — not "which columns
 * changed". Row-level change capture is a database concern; this is a record of
 * intent. See docs/07-data/data-model.md.
 */

export const AUDIT_AGGREGATE_TYPES = [
  "customer",
  "sale",
  "customer_order",
  "payment",
  "debt",
  "membership",
  "product",
  "price_rule",
  "quality_grade",
  "workspace",
  "supplier",
  "supplier_payment",
  "supplier_account",
  "purchase",
  "receipt",
  "inventory",
  "delivery",
  "document",
  "cash_account",
  "expense",
  "cash_transfer",
  "cash",
  "quality_issue_code",
  "goods_arrival",
  "quality_inspection",
  "quality_disposition",
  "cost_observation",
  "reconciliation_observation",
  "debt_observation",
  "supply_commitment_observation",
  "supplier_observation",
  "demand_observation",
  "workspace_policy",
] as const;
export const auditAggregateTypeSchema = z.enum(AUDIT_AGGREGATE_TYPES);
export type AuditAggregateType = z.infer<typeof auditAggregateTypeSchema>;

export const AUDIT_ACTIONS = [
  "customer.created",
  "customer.updated",
  "customer.deactivated",
  "customer.reactivated",
  "sale.draft_created",
  "sale.draft_edited",
  "sale.discarded",
  "sale.posted",
  "sale.voided",
  "customer_order.draft_created",
  "customer_order.draft_edited",
  "customer_order.confirmed",
  "customer_order.cancelled",
  "payment.recorded",
  "payment.reversed",
  "debt.adjusted",
  "account.projection_rebuilt",
  "membership.added",
  "membership.role_changed",
  "membership.reactivated",
  "membership.revoked",
  "product.created",
  "product.updated",
  "product.deactivated",
  "product.reactivated",
  "price_rule.recorded",
  "quality_grade.created",
  "quality_grade.updated",
  "quality_grade.deactivated",
  "quality_grade.reactivated",
  "workspace.backup_exported",
  "workspace.backup_restored",
  "workspace.operational_profile_updated",
  "supplier.created",
  "supplier.updated",
  "supplier.deactivated",
  "supplier.reactivated",
  "supplier_payment.recorded",
  "supplier_payment.reversed",
  "supplier_account.adjusted",
  "supplier_account.projection_rebuilt",
  "purchase.draft_created",
  "purchase.draft_edited",
  "purchase.discarded",
  "purchase.confirmed",
  "purchase.voided",
  "receipt.recorded",
  "receipt.reversed",
  "inventory.adjusted",
  "inventory.reclassified",
  "inventory.projection_rebuilt",
  "delivery.draft_created",
  "delivery.draft_updated",
  "delivery.cancelled",
  "delivery.dispatched",
  "delivery.delivered",
  "delivery.returned",
  "document.generated",
  "document.shared",
  "document.share_revoked",
  "cash_account.created",
  "cash_account.updated",
  "cash_account.deactivated",
  "cash_account.reactivated",
  "expense.recorded",
  "expense.reversed",
  "cash_transfer.recorded",
  "cash_transfer.reversed",
  "cash.adjusted",
  "cash.projection_rebuilt",
  "quality_issue_code.created",
  "quality_issue_code.updated",
  "quality_issue_code.deactivated",
  "quality_issue_code.reactivated",
  "goods_arrival.recorded",
  "goods_arrival.reversed",
  "quality_inspection.recorded",
  "quality_inspection.reversed",
  "quality_disposition.recorded",
  "quality_disposition.reversed",
  "cost_observation.recorded",
  "reconciliation_observation.recorded",
  "debt_observation.recorded",
  "supply_commitment_observation.recorded",
  "supplier_observation.recorded",
  "demand_observation.recorded",
  "workspace_policy.draft_created",
  "workspace_policy.approved",
  "workspace_policy.retired",
] as const;
export const auditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof auditActionSchema>;

/**
 * A short, human-meaningful before/after — "debt 1.200.000 → 900.000", not a dump
 * of the row. Dumping whole aggregates into audit metadata copies customer PII
 * into a table with a different retention policy, so it is not done by default.
 */
export const auditSummarySchema = z.record(z.string(), z.unknown());

export const auditRecordDtoSchema = z.object({
  id: auditRecordIdSchema,
  workspaceId: workspaceIdSchema,
  commandId: commandIdSchema,
  actorId: actorIdSchema,
  aggregateType: auditAggregateTypeSchema,
  aggregateId: z.uuid(),
  action: auditActionSchema,
  /** When the business action happened. */
  transactionTime: isoInstantSchema,
  /** When it was recorded. Differs from the above for back-dated entries. */
  recordedAt: isoInstantSchema,
  before: auditSummarySchema.nullable(),
  after: auditSummarySchema.nullable(),
  reason: z.string().nullable(),
  /** Populated when the action was refused or an override was applied. */
  rejectionCode: domainRejectionCodeSchema.nullable(),
});
export type AuditRecordDto = z.infer<typeof auditRecordDtoSchema>;

// --- reads -------------------------------------------------------------------

/**
 * How one audited action relates to another (UC-AUDIT-001).
 *
 * The worked example is a sale posted for the wrong amount, voided, and replaced.
 * Without this the reader sees four unrelated actions and has to infer the story;
 * with it, the void names the sale it undid and the replacement names the sale it
 * supersedes, so the correction reads as one sequence.
 */
export const AUDIT_CORRECTION_RELATIONS = ["voids_sale", "replaces_sale"] as const;
export const auditCorrectionRelationSchema = z.enum(AUDIT_CORRECTION_RELATIONS);
export type AuditCorrectionRelation = z.infer<typeof auditCorrectionRelationSchema>;

export const auditCorrectionSchema = z.object({
  relation: auditCorrectionRelationSchema,
  /** The sale being undone or superseded — never the one this record is about. */
  targetSaleId: saleIdSchema,
});
export type AuditCorrection = z.infer<typeof auditCorrectionSchema>;

/**
 * One row of the audit timeline.
 *
 * Note what this is not: row-level change capture. `before` and `after` are short
 * semantic summaries — "status draft → posted, total 1.200.000" — never a dump of
 * the aggregate, which would copy customer data into a table with a different
 * retention policy and bury the business action under diff noise.
 */
export const auditTimelineEntryDtoSchema = z.object({
  id: auditRecordIdSchema,
  workspaceId: workspaceIdSchema,
  actorId: actorIdSchema,
  /** Resolved so the reader sees a person, not a uuid. */
  actorDisplayName: z.string(),
  commandId: commandIdSchema,
  action: auditActionSchema,
  /** What the action was performed on: the source of this record. */
  aggregateType: auditAggregateTypeSchema,
  aggregateId: z.uuid(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  before: auditSummarySchema.nullable(),
  after: auditSummarySchema.nullable(),
  reason: z.string().nullable(),
  rejectionCode: domainRejectionCodeSchema.nullable(),
  correction: auditCorrectionSchema.nullable(),
});
export type AuditTimelineEntryDto = z.infer<typeof auditTimelineEntryDtoSchema>;

export const auditTimelineInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  aggregateType: auditAggregateTypeSchema.nullable().default(null),
  aggregateId: z.uuid().nullable().default(null),
  actorId: actorIdSchema.nullable().default(null),
  from: isoInstantSchema.nullable().default(null),
  to: isoInstantSchema.nullable().default(null),
});
export type AuditTimelineInput = z.infer<typeof auditTimelineInputSchema>;
