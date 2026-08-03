import { and, asc, eq } from "drizzle-orm";
import type { StocktakeCountState, StocktakeSessionState } from "@vuarau/domain-kernel";
import { stocktakeCounts, stocktakeSessions } from "../../schema/index.ts";
import { fromIso } from "../row-mappers.ts";
import { toStocktakeCountState, toStocktakeSessionState } from "../shared/stocktake-mappers.ts";
import type { Tx } from "../shared/types.ts";
import type { WorkspaceId } from "@vuarau/domain-contracts";

async function loadSession(
  tx: Tx,
  workspaceId: WorkspaceId,
  sessionId: StocktakeSessionState["id"],
  lock: boolean,
) {
  const query = tx
    .select()
    .from(stocktakeSessions)
    .where(and(eq(stocktakeSessions.workspaceId, workspaceId), eq(stocktakeSessions.id, sessionId)))
    .limit(1);
  const rows = lock ? await query.for("update") : await query;
  const row = rows[0];
  if (row === undefined) return null;
  const countRows = await tx
    .select()
    .from(stocktakeCounts)
    .where(
      and(eq(stocktakeCounts.workspaceId, workspaceId), eq(stocktakeCounts.sessionId, sessionId)),
    )
    .orderBy(asc(stocktakeCounts.recordedAt), asc(stocktakeCounts.id));
  return toStocktakeSessionState(row, countRows.map(toStocktakeCountState));
}

export const createStocktakeWriteRepositories = (tx: Tx) => ({
  stocktakes: {
    findById: (workspaceId: WorkspaceId, sessionId: StocktakeSessionState["id"]) =>
      loadSession(tx, workspaceId, sessionId, false),
    findByIdForUpdate: (workspaceId: WorkspaceId, sessionId: StocktakeSessionState["id"]) =>
      loadSession(tx, workspaceId, sessionId, true),
    async insert(session: StocktakeSessionState) {
      const rows = await tx
        .insert(stocktakeSessions)
        .values({
          id: session.id,
          workspaceId: session.workspaceId,
          asOf: fromIso(session.asOf),
          scopeReference: session.scopeReference,
          note: session.note,
          status: session.status,
          version: session.version,
          policyVersionId: session.policyVersionId,
          varianceMovementIds: [...session.varianceMovementIds],
          transactionTime: fromIso(session.transactionTime),
          recordedAt: fromIso(session.recordedAt),
          actorId: session.actorId,
          evidenceReferences: [...session.evidenceReferences],
          commandId: session.commandId,
        })
        .onConflictDoNothing()
        .returning({ id: stocktakeSessions.id });
      return rows.length === 1;
    },
    async insertCount(count: StocktakeCountState) {
      const rows = await tx
        .insert(stocktakeCounts)
        .values({
          id: count.id,
          workspaceId: count.workspaceId,
          sessionId: count.sessionId,
          productId: count.productId,
          qualityGradeId: count.qualityGradeId,
          qualityGradeName: count.qualityGradeName,
          quantityScaled: count.quantity.valueScaled,
          unit: count.quantity.unit,
          supersedesCountId: count.supersedesCountId,
          transactionTime: fromIso(count.transactionTime),
          recordedAt: fromIso(count.recordedAt),
          actorId: count.actorId,
          evidenceReferences: [...count.evidenceReferences],
          commandId: count.commandId,
        })
        .onConflictDoNothing()
        .returning({ id: stocktakeCounts.id });
      return rows.length === 1;
    },
    async update(session: StocktakeSessionState, expectedVersion: number) {
      const rows = await tx
        .update(stocktakeSessions)
        .set({
          status: session.status,
          version: session.version,
          varianceMovementIds: [...session.varianceMovementIds],
          evidenceReferences: [...session.evidenceReferences],
        })
        .where(
          and(
            eq(stocktakeSessions.workspaceId, session.workspaceId),
            eq(stocktakeSessions.id, session.id),
            eq(stocktakeSessions.version, expectedVersion),
          ),
        )
        .returning({ id: stocktakeSessions.id });
      return rows.length === 1;
    },
  },
});
