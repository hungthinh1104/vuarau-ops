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

export const AUDIT_AGGREGATE_TYPES = ["customer", "sale", "payment", "debt", "membership"] as const;
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
  "payment.recorded",
  "payment.reversed",
  "debt.adjusted",
  "account.projection_rebuilt",
  "membership.added",
  "membership.role_changed",
  "membership.reactivated",
  "membership.revoked",
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
