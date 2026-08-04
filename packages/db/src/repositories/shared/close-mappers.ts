import type { CashStatementMatchDto, OperationalCloseDto } from "@vuarau/domain-contracts";
import type {
  cashStatementMatches,
  cashStatementMatchReversals,
  operationalCloses,
  operationalCloseReopens,
} from "../../schema/index.ts";
import { toIso } from "../row-mappers.ts";

export function toOperationalCloseDto(
  row: typeof operationalCloses.$inferSelect,
  reopen: typeof operationalCloseReopens.$inferSelect | undefined,
): OperationalCloseDto {
  return {
    id: row.id as OperationalCloseDto["id"],
    workspaceId: row.workspaceId as OperationalCloseDto["workspaceId"],
    businessDate: row.businessDate,
    supersedesOperationalCloseId: row.supersedesOperationalCloseId as
      OperationalCloseDto["id"] | null,
    period: { start: toIso(row.periodStart), end: toIso(row.periodEnd) },
    state: reopen === undefined ? "closed" : "reopened",
    version: reopen === undefined ? row.version : row.version + 1,
    observationIds: row.observationIds as OperationalCloseDto["observationIds"],
    evidenceReferences: row.evidenceReferences,
    policyVersionId: row.policyVersionId as OperationalCloseDto["policyVersionId"],
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId as OperationalCloseDto["actorId"],
    commandId: row.commandId as OperationalCloseDto["commandId"],
    reason: row.reason,
    reopen:
      reopen === undefined
        ? null
        : {
            id: reopen.id as NonNullable<OperationalCloseDto["reopen"]>["id"],
            reason: reopen.reason,
            evidenceReferences: reopen.evidenceReferences,
            transactionTime: toIso(reopen.transactionTime),
            recordedAt: toIso(reopen.recordedAt),
            actorId: reopen.actorId as NonNullable<OperationalCloseDto["reopen"]>["actorId"],
            commandId: reopen.commandId as NonNullable<OperationalCloseDto["reopen"]>["commandId"],
          },
  };
}

export function toCashStatementMatchDto(
  row: typeof cashStatementMatches.$inferSelect,
  reversal: typeof cashStatementMatchReversals.$inferSelect | undefined,
): CashStatementMatchDto {
  return {
    id: row.id as CashStatementMatchDto["id"],
    workspaceId: row.workspaceId as CashStatementMatchDto["workspaceId"],
    cashAccountId: row.cashAccountId as CashStatementMatchDto["cashAccountId"],
    cashMovementId: row.cashMovementId as CashStatementMatchDto["cashMovementId"],
    externalReference: row.externalReference,
    statementAt: toIso(row.statementAt),
    amount: { amountMinor: row.amountMinor, currency: row.currency },
    sourceType: row.sourceType,
    policyVersionId: row.policyVersionId as CashStatementMatchDto["policyVersionId"],
    evidenceReferences: row.evidenceReferences,
    version: reversal === undefined ? 1 : 2,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId as CashStatementMatchDto["actorId"],
    commandId: row.commandId as CashStatementMatchDto["commandId"],
    reversal:
      reversal === undefined
        ? null
        : {
            id: reversal.id as NonNullable<CashStatementMatchDto["reversal"]>["id"],
            reason: reversal.reason,
            evidenceReferences: reversal.evidenceReferences,
            transactionTime: toIso(reversal.transactionTime),
            recordedAt: toIso(reversal.recordedAt),
            actorId: reversal.actorId as NonNullable<CashStatementMatchDto["reversal"]>["actorId"],
            commandId: reversal.commandId as NonNullable<
              CashStatementMatchDto["reversal"]
            >["commandId"],
          },
  };
}
