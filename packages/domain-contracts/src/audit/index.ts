import { z } from "zod";
import {
  actorIdSchema,
  auditRecordIdSchema,
  commandIdSchema,
  workspaceIdSchema,
} from "../shared/ids.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { domainRejectionCodeSchema } from "../shared/rejection-codes.ts";

/**
 * Audit answers "who did what business action, and why" — not "which columns
 * changed". Row-level change capture is a database concern; this is a record of
 * intent. See docs/07-data/data-model.md.
 */

export const AUDIT_AGGREGATE_TYPES = ["customer", "order", "payment", "debt"] as const;
export const auditAggregateTypeSchema = z.enum(AUDIT_AGGREGATE_TYPES);
export type AuditAggregateType = z.infer<typeof auditAggregateTypeSchema>;

export const AUDIT_ACTIONS = [
  "customer.created",
  "order.created",
  "order.confirmed",
  "payment.recorded",
  "payment.reversed",
  "debt.adjusted",
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
