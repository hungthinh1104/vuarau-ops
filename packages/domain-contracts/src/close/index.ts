import { z } from "zod";
import {
  reconciliationObservationKindSchema,
  type ReconciliationObservationKind,
} from "../evidence/index.ts";
import { cashMovementSourceTypeSchema, type CashMovementDto } from "../cash/index.ts";
import {
  actorIdSchema,
  cashAccountIdSchema,
  cashMovementIdSchema,
  cashStatementMatchIdSchema,
  cashStatementMatchReversalIdSchema,
  commandIdSchema,
  operationalCloseExceptionAcknowledgementIdSchema,
  operationalCloseIdSchema,
  operationalCloseReopenIdSchema,
  reconciliationObservationIdSchema,
  workspaceIdSchema,
  workspacePolicyVersionIdSchema,
} from "../shared/ids.ts";
import { defineCommand, defineVersionedCommand } from "../shared/command.ts";
import { evidenceReferencesInputSchema, evidenceReferencesDtoSchema } from "../shared/evidence.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { pageOf, pageRequestSchema } from "../shared/pagination.ts";
import { moneySchema } from "../shared/money.ts";
import {
  operationsExceptionCloseImpactSchema,
  operationsExceptionDefinitionSchema,
  operationsExceptionKindSchema,
  operationsExceptionNextActionSchema,
  operationsExceptionSeveritySchema,
  operationsExceptionSourceSchema,
  operationsSemanticCategorySchema,
  operationsControlExceptionSchema,
} from "../operations/exceptions.ts";

export const OPERATIONAL_CLOSE_STATES = ["closed", "reopened"] as const;
export const operationalCloseStateSchema = z.enum(OPERATIONAL_CLOSE_STATES);
export type OperationalCloseState = z.infer<typeof operationalCloseStateSchema>;

const closePeriodSchema = z.object({
  start: isoInstantSchema,
  end: isoInstantSchema,
});

const operationalClosePayloadSchema = z.object({
  operationalCloseId: operationalCloseIdSchema,
  supersedesOperationalCloseId: operationalCloseIdSchema.nullable().default(null),
  businessDate: z.iso.date(),
  observationIds: z.array(reconciliationObservationIdSchema).min(1).max(20),
  evidenceReferences: evidenceReferencesInputSchema.refine((refs) => refs.length > 0, {
    message: "Closing requires evidence references.",
  }),
  reason: z.string().trim().min(1).max(500),
});
export const recordOperationalCloseCommandSchema = defineCommand(operationalClosePayloadSchema);
export type RecordOperationalCloseCommand = z.infer<typeof recordOperationalCloseCommandSchema>;

export const reopenOperationalCloseCommandSchema = defineVersionedCommand(
  z.object({
    operationalCloseId: operationalCloseIdSchema,
    reopenId: operationalCloseReopenIdSchema,
    reason: z.string().trim().min(1).max(500),
    evidenceReferences: evidenceReferencesInputSchema.refine((refs) => refs.length > 0, {
      message: "Reopening requires evidence references.",
    }),
  }),
);
export type ReopenOperationalCloseCommand = z.infer<typeof reopenOperationalCloseCommandSchema>;

const operationalCloseExceptionSourceSchema = operationsExceptionSourceSchema.extend({
  id: z.string().min(1),
});

const operationalCloseExceptionAcknowledgementPayloadSchema = z.object({
  operationalCloseExceptionAcknowledgementId: operationalCloseExceptionAcknowledgementIdSchema,
  businessDate: z.iso.date(),
  exceptionKind: operationsExceptionKindSchema,
  source: operationalCloseExceptionSourceSchema,
  evidenceReferences: evidenceReferencesInputSchema.refine((refs) => refs.length > 0, {
    message: "Acknowledging an exception requires evidence references.",
  }),
  reason: z.string().trim().min(1).max(500),
});
export const recordOperationalCloseExceptionAcknowledgementCommandSchema = defineCommand(
  operationalCloseExceptionAcknowledgementPayloadSchema,
);
export type RecordOperationalCloseExceptionAcknowledgementCommand = z.infer<
  typeof recordOperationalCloseExceptionAcknowledgementCommandSchema
>;

const closeReopenDtoSchema = z.object({
  id: operationalCloseReopenIdSchema,
  reason: z.string(),
  evidenceReferences: evidenceReferencesDtoSchema,
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
});

export const operationalCloseDtoSchema = z.object({
  id: operationalCloseIdSchema,
  workspaceId: workspaceIdSchema,
  businessDate: z.iso.date(),
  supersedesOperationalCloseId: operationalCloseIdSchema.nullable(),
  period: closePeriodSchema,
  state: operationalCloseStateSchema,
  version: z.int().positive(),
  observationIds: z.array(reconciliationObservationIdSchema),
  evidenceReferences: evidenceReferencesDtoSchema,
  policyVersionId: workspacePolicyVersionIdSchema,
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
  reason: z.string(),
  reopen: closeReopenDtoSchema.nullable(),
});
export type OperationalCloseDto = z.infer<typeof operationalCloseDtoSchema>;

export const operationalCloseExceptionAcknowledgementDtoSchema = z.object({
  id: operationalCloseExceptionAcknowledgementIdSchema,
  workspaceId: workspaceIdSchema,
  businessDate: z.iso.date(),
  exceptionKind: operationsExceptionKindSchema,
  source: operationalCloseExceptionSourceSchema,
  evidenceReferences: evidenceReferencesDtoSchema,
  policyVersionId: workspacePolicyVersionIdSchema,
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
  reason: z.string(),
});
export type OperationalCloseExceptionAcknowledgementDto = z.infer<
  typeof operationalCloseExceptionAcknowledgementDtoSchema
>;

export const operationalCloseGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  operationalCloseId: operationalCloseIdSchema,
});
export type OperationalCloseGetInput = z.infer<typeof operationalCloseGetInputSchema>;
export const operationalCloseListInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  fromBusinessDate: z.iso.date().nullable().default(null),
  toBusinessDate: z.iso.date().nullable().default(null),
});
export type OperationalCloseListInput = z.infer<typeof operationalCloseListInputSchema>;
export const operationalClosePageSchema = pageOf(operationalCloseDtoSchema);

export const operationalCloseReadinessInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  businessDate: z.iso.date().nullable().default(null),
});
export type OperationalCloseReadinessInput = {
  workspaceId: z.infer<typeof workspaceIdSchema>;
  businessDate?: string | null;
};
export const OPERATIONAL_CLOSE_READINESS_BLOCKERS = [
  "policy_unavailable",
  "missing_observation",
  "already_closed",
  "blocking_exception",
  "unacknowledged_exception",
] as const;
export const operationalCloseReadinessBlockerSchema = z.enum(OPERATIONAL_CLOSE_READINESS_BLOCKERS);
export type OperationalCloseReadinessBlocker = z.infer<
  typeof operationalCloseReadinessBlockerSchema
>;
export const operationalCloseExceptionSummarySchema = z.object({
  kind: operationsExceptionKindSchema,
  category: operationsSemanticCategorySchema,
  count: z.int().positive(),
  severity: operationsExceptionSeveritySchema,
  closeImpact: operationsExceptionCloseImpactSchema,
  explanation: operationsExceptionDefinitionSchema.shape.explanation,
  nextAction: operationsExceptionNextActionSchema,
  resolutionCondition: operationsExceptionDefinitionSchema.shape.resolutionCondition,
  acknowledgedCount: z.int().nonnegative(),
});
export type OperationalCloseExceptionSummary = z.infer<
  typeof operationalCloseExceptionSummarySchema
>;
export const operationalCloseReadinessSchema = z.object({
  workspaceId: workspaceIdSchema,
  businessDate: z.iso.date(),
  period: closePeriodSchema,
  asOf: isoInstantSchema,
  state: z.enum(["ready", "blocked"]),
  blockers: z.array(operationalCloseReadinessBlockerSchema),
  controlException: operationsControlExceptionSchema.nullable(),
  exceptionSummary: z.array(operationalCloseExceptionSummarySchema),
  acknowledgements: z.array(operationalCloseExceptionAcknowledgementDtoSchema),
  policyVersionId: workspacePolicyVersionIdSchema.nullable(),
  requiredObservationKinds: z.array(reconciliationObservationKindSchema),
  availableObservationKinds: z.array(reconciliationObservationKindSchema),
  missingObservationKinds: z.array(reconciliationObservationKindSchema),
  existingCloseId: operationalCloseIdSchema.nullable(),
  existingCloseState: operationalCloseStateSchema.nullable(),
  existingCloseVersion: z.int().positive().nullable(),
});
export type OperationalCloseReadiness = z.infer<typeof operationalCloseReadinessSchema>;

const cashStatementMatchPayloadSchema = z.object({
  cashStatementMatchId: cashStatementMatchIdSchema,
  cashAccountId: cashAccountIdSchema,
  cashMovementId: cashMovementIdSchema,
  externalReference: z.string().trim().min(1).max(500),
  statementAt: isoInstantSchema,
  amount: moneySchema,
  evidenceReferences: evidenceReferencesInputSchema.refine((refs) => refs.length > 0, {
    message: "A statement match requires evidence references.",
  }),
});
export const recordCashStatementMatchCommandSchema = defineCommand(cashStatementMatchPayloadSchema);
export type RecordCashStatementMatchCommand = z.infer<typeof recordCashStatementMatchCommandSchema>;

export const reverseCashStatementMatchCommandSchema = defineVersionedCommand(
  z.object({
    cashStatementMatchId: cashStatementMatchIdSchema,
    reversalId: cashStatementMatchReversalIdSchema,
    reason: z.string().trim().min(1).max(500),
    evidenceReferences: evidenceReferencesInputSchema.refine((refs) => refs.length > 0, {
      message: "Reversing a statement match requires evidence references.",
    }),
  }),
);
export type ReverseCashStatementMatchCommand = z.infer<
  typeof reverseCashStatementMatchCommandSchema
>;

const statementMatchReversalDtoSchema = z.object({
  id: cashStatementMatchReversalIdSchema,
  reason: z.string(),
  evidenceReferences: evidenceReferencesDtoSchema,
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
});

export const cashStatementMatchDtoSchema = z.object({
  id: cashStatementMatchIdSchema,
  workspaceId: workspaceIdSchema,
  cashAccountId: cashAccountIdSchema,
  cashMovementId: cashMovementIdSchema,
  externalReference: z.string(),
  statementAt: isoInstantSchema,
  amount: moneySchema,
  sourceType: cashMovementSourceTypeSchema,
  policyVersionId: workspacePolicyVersionIdSchema,
  evidenceReferences: evidenceReferencesDtoSchema,
  version: z.int().positive(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
  reversal: statementMatchReversalDtoSchema.nullable(),
});
export type CashStatementMatchDto = z.infer<typeof cashStatementMatchDtoSchema>;

export const cashStatementMatchGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  cashStatementMatchId: cashStatementMatchIdSchema,
});
export type CashStatementMatchGetInput = z.infer<typeof cashStatementMatchGetInputSchema>;
export const cashStatementMatchListInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  cashAccountId: cashAccountIdSchema.nullable().default(null),
  sourceType: cashMovementSourceTypeSchema.nullable().default(null),
});
export type CashStatementMatchListInput = z.infer<typeof cashStatementMatchListInputSchema>;
export const cashStatementMatchPageSchema = pageOf(cashStatementMatchDtoSchema);

export type CloseRequiredObservationKinds = readonly ReconciliationObservationKind[];
export type CashMovementForStatementMatch = Pick<
  CashMovementDto,
  "id" | "workspaceId" | "cashAccountId" | "amount" | "sourceType"
>;
