import { eq } from "drizzle-orm";
import {
  cashStatementMatches,
  cashStatementMatchReversals,
  operationalCloses,
  operationalCloseReopens,
} from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";

type CloseBackupRows = {
  operationalCloses: Record<string, unknown>[];
  operationalCloseReopens: Record<string, unknown>[];
  cashStatementMatches: Record<string, unknown>[];
  cashStatementMatchReversals: Record<string, unknown>[];
};

const plain = (value: unknown): Record<string, unknown> =>
  JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

export async function readOperationsCloseBackup(
  tx: Tx,
  workspaceId: string,
): Promise<CloseBackupRows> {
  const [closeRows, reopenRows, matchRows, reversalRows] = await Promise.all([
    tx.select().from(operationalCloses).where(eq(operationalCloses.workspaceId, workspaceId)),
    tx
      .select()
      .from(operationalCloseReopens)
      .where(eq(operationalCloseReopens.workspaceId, workspaceId)),
    tx.select().from(cashStatementMatches).where(eq(cashStatementMatches.workspaceId, workspaceId)),
    tx
      .select()
      .from(cashStatementMatchReversals)
      .where(eq(cashStatementMatchReversals.workspaceId, workspaceId)),
  ]);
  const reopenByCloseId = new Map(reopenRows.map((row) => [row.operationalCloseId, row]));
  const reversalByMatchId = new Map(reversalRows.map((row) => [row.cashStatementMatchId, row]));

  return {
    operationalCloses: closeRows.map((row) => {
      const reopen = reopenByCloseId.get(row.id);
      return plain({
        id: row.id,
        workspaceId: row.workspaceId,
        businessDate: row.businessDate,
        supersedesOperationalCloseId: row.supersedesOperationalCloseId,
        period: { start: row.periodStart.toISOString(), end: row.periodEnd.toISOString() },
        state: reopen === undefined ? "closed" : "reopened",
        version: reopen === undefined ? row.version : row.version + 1,
        observationIds: row.observationIds,
        evidenceReferences: row.evidenceReferences,
        policyVersionId: row.policyVersionId,
        transactionTime: row.transactionTime.toISOString(),
        recordedAt: row.recordedAt.toISOString(),
        actorId: row.actorId,
        commandId: row.commandId,
        reason: row.reason,
      });
    }),
    operationalCloseReopens: reopenRows.map(plain),
    cashStatementMatches: matchRows.map((row) =>
      plain({
        id: row.id,
        workspaceId: row.workspaceId,
        cashAccountId: row.cashAccountId,
        cashMovementId: row.cashMovementId,
        externalReference: row.externalReference,
        statementAt: row.statementAt.toISOString(),
        amount: { amountMinor: row.amountMinor, currency: row.currency },
        sourceType: row.sourceType,
        policyVersionId: row.policyVersionId,
        evidenceReferences: row.evidenceReferences,
        version: reversalByMatchId.has(row.id) ? 2 : 1,
        transactionTime: row.transactionTime.toISOString(),
        recordedAt: row.recordedAt.toISOString(),
        actorId: row.actorId,
        commandId: row.commandId,
      }),
    ),
    cashStatementMatchReversals: reversalRows.map(plain),
  };
}
