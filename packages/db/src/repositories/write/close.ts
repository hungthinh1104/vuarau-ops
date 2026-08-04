import { and, desc, eq, isNull } from "drizzle-orm";
import type {
  CashStatementMatchDto,
  OperationalCloseDto,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import {
  cashStatementMatches,
  cashStatementMatchReversals,
  operationalCloses,
  operationalCloseReopens,
} from "../../schema/index.ts";
import { fromIso } from "../row-mappers.ts";
import type { Tx } from "../shared/types.ts";
import { toCashStatementMatchDto, toOperationalCloseDto } from "../shared/close-mappers.ts";

export const createCloseWriteRepositories = (tx: Tx) => ({
  operationalCloses: {
    async findByIdForUpdate(
      workspaceId: WorkspaceId,
      operationalCloseId: OperationalCloseDto["id"],
    ) {
      const row = (
        await tx
          .select()
          .from(operationalCloses)
          .where(
            and(
              eq(operationalCloses.workspaceId, workspaceId),
              eq(operationalCloses.id, operationalCloseId),
            ),
          )
          .limit(1)
          .for("update")
      )[0];
      if (row === undefined) return null;
      const reopen = (
        await tx
          .select()
          .from(operationalCloseReopens)
          .where(
            and(
              eq(operationalCloseReopens.workspaceId, workspaceId),
              eq(operationalCloseReopens.operationalCloseId, operationalCloseId),
            ),
          )
          .limit(1)
      )[0];
      return toOperationalCloseDto(row, reopen);
    },
    async findByBusinessDate(workspaceId: WorkspaceId, businessDate: string) {
      const row = (
        await tx
          .select()
          .from(operationalCloses)
          .where(
            and(
              eq(operationalCloses.workspaceId, workspaceId),
              eq(operationalCloses.businessDate, businessDate),
            ),
          )
          .orderBy(
            desc(operationalCloses.recordedAt),
            desc(operationalCloses.transactionTime),
            desc(operationalCloses.id),
          )
          .limit(1)
      )[0];
      if (row === undefined) return null;
      const reopen = (
        await tx
          .select()
          .from(operationalCloseReopens)
          .where(
            and(
              eq(operationalCloseReopens.workspaceId, workspaceId),
              eq(operationalCloseReopens.operationalCloseId, row.id),
            ),
          )
          .limit(1)
      )[0];
      return toOperationalCloseDto(row, reopen);
    },
    async insert(close: OperationalCloseDto) {
      const rows = await tx
        .insert(operationalCloses)
        .values({
          id: close.id,
          workspaceId: close.workspaceId,
          businessDate: close.businessDate,
          supersedesOperationalCloseId: close.supersedesOperationalCloseId,
          periodStart: fromIso(close.period.start),
          periodEnd: fromIso(close.period.end),
          observationIds: [...close.observationIds],
          evidenceReferences: [...close.evidenceReferences],
          policyVersionId: close.policyVersionId,
          transactionTime: fromIso(close.transactionTime),
          recordedAt: fromIso(close.recordedAt),
          actorId: close.actorId,
          commandId: close.commandId,
          version: close.version,
          reason: close.reason,
        })
        .onConflictDoNothing()
        .returning({ id: operationalCloses.id });
      return rows.length === 1;
    },
    async insertReopen(
      workspaceId: WorkspaceId,
      operationalCloseId: OperationalCloseDto["id"],
      reopen: NonNullable<OperationalCloseDto["reopen"]>,
    ) {
      const rows = await tx
        .insert(operationalCloseReopens)
        .values({
          id: reopen.id,
          workspaceId,
          operationalCloseId,
          reason: reopen.reason,
          evidenceReferences: [...reopen.evidenceReferences],
          transactionTime: fromIso(reopen.transactionTime),
          recordedAt: fromIso(reopen.recordedAt),
          actorId: reopen.actorId,
          commandId: reopen.commandId,
        })
        .onConflictDoNothing()
        .returning({ id: operationalCloseReopens.id });
      return rows.length === 1;
    },
  },
  cashStatementMatches: {
    async findByIdForUpdate(
      workspaceId: WorkspaceId,
      cashStatementMatchId: CashStatementMatchDto["id"],
    ) {
      const row = (
        await tx
          .select()
          .from(cashStatementMatches)
          .where(
            and(
              eq(cashStatementMatches.workspaceId, workspaceId),
              eq(cashStatementMatches.id, cashStatementMatchId),
            ),
          )
          .limit(1)
          .for("update")
      )[0];
      if (row === undefined) return null;
      const reversal = (
        await tx
          .select()
          .from(cashStatementMatchReversals)
          .where(
            and(
              eq(cashStatementMatchReversals.workspaceId, workspaceId),
              eq(cashStatementMatchReversals.cashStatementMatchId, cashStatementMatchId),
            ),
          )
          .limit(1)
      )[0];
      return toCashStatementMatchDto(row, reversal);
    },
    async findByMovementId(
      workspaceId: WorkspaceId,
      cashMovementId: CashStatementMatchDto["cashMovementId"],
    ) {
      const row = (
        await tx
          .select()
          .from(cashStatementMatches)
          .leftJoin(
            cashStatementMatchReversals,
            and(
              eq(cashStatementMatchReversals.workspaceId, cashStatementMatches.workspaceId),
              eq(cashStatementMatchReversals.cashStatementMatchId, cashStatementMatches.id),
            ),
          )
          .where(
            and(
              eq(cashStatementMatches.workspaceId, workspaceId),
              eq(cashStatementMatches.cashMovementId, cashMovementId),
              isNull(cashStatementMatchReversals.id),
            ),
          )
          .limit(1)
      )[0]?.cash_statement_matches;
      if (row === undefined) return null;
      const reversal = (
        await tx
          .select()
          .from(cashStatementMatchReversals)
          .where(
            and(
              eq(cashStatementMatchReversals.workspaceId, workspaceId),
              eq(cashStatementMatchReversals.cashStatementMatchId, row.id),
            ),
          )
          .limit(1)
      )[0];
      return toCashStatementMatchDto(row, reversal);
    },
    async findByExternalReference(workspaceId: WorkspaceId, externalReference: string) {
      const row = (
        await tx
          .select()
          .from(cashStatementMatches)
          .leftJoin(
            cashStatementMatchReversals,
            and(
              eq(cashStatementMatchReversals.workspaceId, cashStatementMatches.workspaceId),
              eq(cashStatementMatchReversals.cashStatementMatchId, cashStatementMatches.id),
            ),
          )
          .where(
            and(
              eq(cashStatementMatches.workspaceId, workspaceId),
              eq(cashStatementMatches.externalReference, externalReference),
              isNull(cashStatementMatchReversals.id),
            ),
          )
          .limit(1)
      )[0]?.cash_statement_matches;
      if (row === undefined) return null;
      const reversal = (
        await tx
          .select()
          .from(cashStatementMatchReversals)
          .where(
            and(
              eq(cashStatementMatchReversals.workspaceId, workspaceId),
              eq(cashStatementMatchReversals.cashStatementMatchId, row.id),
            ),
          )
          .limit(1)
      )[0];
      return toCashStatementMatchDto(row, reversal);
    },
    async insert(match: CashStatementMatchDto) {
      const rows = await tx
        .insert(cashStatementMatches)
        .values({
          id: match.id,
          workspaceId: match.workspaceId,
          cashAccountId: match.cashAccountId,
          cashMovementId: match.cashMovementId,
          externalReference: match.externalReference,
          statementAt: fromIso(match.statementAt),
          amountMinor: match.amount.amountMinor,
          currency: match.amount.currency,
          sourceType: match.sourceType,
          policyVersionId: match.policyVersionId,
          evidenceReferences: [...match.evidenceReferences],
          transactionTime: fromIso(match.transactionTime),
          recordedAt: fromIso(match.recordedAt),
          actorId: match.actorId,
          commandId: match.commandId,
        })
        .onConflictDoNothing()
        .returning({ id: cashStatementMatches.id });
      return rows.length === 1;
    },
    async insertReversal(reversal: {
      id: NonNullable<CashStatementMatchDto["reversal"]>["id"];
      workspaceId: WorkspaceId;
      cashStatementMatchId: CashStatementMatchDto["id"];
      reason: string;
      evidenceReferences: readonly string[];
      transactionTime: CashStatementMatchDto["transactionTime"];
      recordedAt: CashStatementMatchDto["recordedAt"];
      actorId: CashStatementMatchDto["actorId"];
      commandId: CashStatementMatchDto["commandId"];
    }) {
      const rows = await tx
        .insert(cashStatementMatchReversals)
        .values({
          id: reversal.id,
          workspaceId: reversal.workspaceId,
          cashStatementMatchId: reversal.cashStatementMatchId,
          reason: reversal.reason,
          evidenceReferences: [...reversal.evidenceReferences],
          transactionTime: fromIso(reversal.transactionTime),
          recordedAt: fromIso(reversal.recordedAt),
          actorId: reversal.actorId,
          commandId: reversal.commandId,
        })
        .onConflictDoNothing()
        .returning({ id: cashStatementMatchReversals.id });
      return rows.length === 1;
    },
  },
});
