import { z } from "zod";
import type { ReconciliationObservationKind } from "../evidence/index.ts";
import { cashMovementSourceTypeSchema, type CashMovementDto } from "../cash/index.ts";
import {
  actorIdSchema,
  cashAccountIdSchema,
  cashMovementIdSchema,
  cashStatementMatchIdSchema,
  cashStatementMatchReversalIdSchema,
  commandIdSchema,
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

export const OPERATIONAL_CLOSE_STATES = ["closed", "reopened"] as const;
export const operationalCloseStateSchema = z.enum(OPERATIONAL_CLOSE_STATES);
export type OperationalCloseState = z.infer<typeof operationalCloseStateSchema>;

const closePeriodSchema = z.object({
  start: isoInstantSchema,
  end: isoInstantSchema,
});

const operationalClosePayloadSchema = z.object({
  operationalCloseId: operationalCloseIdSchema,
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
