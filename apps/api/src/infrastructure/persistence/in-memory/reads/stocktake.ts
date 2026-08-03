import type { StocktakeDto } from "@vuarau/domain-contracts";
import { stocktakeCountDto } from "@vuarau/domain-kernel";
import type { Repositories } from "../../ports.ts";
import type { Store } from "../store.ts";
import { key } from "../store.ts";

export const createStocktakeReads = (store: Store): Pick<Repositories, "stocktakeReads"> => ({
  stocktakeReads: {
    get: async (workspaceId, sessionId): Promise<StocktakeDto | null> => {
      const session = store.stocktakeSessions.get(key(workspaceId, sessionId));
      if (session === undefined) return null;
      const counts = [...store.stocktakeCounts.values()]
        .filter((count) => count.workspaceId === workspaceId && count.sessionId === sessionId)
        .sort((left, right) =>
          left.recordedAt === right.recordedAt
            ? left.id.localeCompare(right.id)
            : left.recordedAt.localeCompare(right.recordedAt),
        )
        .map(stocktakeCountDto);
      return {
        ...session,
        counts,
        varianceMovementIds: [...session.varianceMovementIds],
        evidenceReferences: [...session.evidenceReferences],
      };
    },
  },
});
