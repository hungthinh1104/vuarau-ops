import { and, asc, eq } from "drizzle-orm";
import type { StocktakeSessionId, WorkspaceId } from "@vuarau/domain-contracts";
import { stocktakeCounts, stocktakeSessions } from "../../schema/index.ts";
import { toStocktakeCountState, toStocktakeSessionState } from "../shared/stocktake-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createStocktakeReadRepositories = (tx: Tx) => ({
  stocktakeReads: {
    async get(workspaceId: WorkspaceId, sessionId: StocktakeSessionId) {
      const rows = await tx
        .select()
        .from(stocktakeSessions)
        .where(
          and(eq(stocktakeSessions.workspaceId, workspaceId), eq(stocktakeSessions.id, sessionId)),
        )
        .limit(1);
      const session = rows[0];
      if (session === undefined) return null;
      const counts = await tx
        .select()
        .from(stocktakeCounts)
        .where(
          and(
            eq(stocktakeCounts.workspaceId, workspaceId),
            eq(stocktakeCounts.sessionId, sessionId),
          ),
        )
        .orderBy(asc(stocktakeCounts.recordedAt), asc(stocktakeCounts.id));
      return toStocktakeSessionState(session, counts.map(toStocktakeCountState));
    },
  },
});
