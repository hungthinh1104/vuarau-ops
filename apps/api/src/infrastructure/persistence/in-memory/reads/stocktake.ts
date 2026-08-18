import type { StocktakeDto } from "@vuarau/domain-contracts";
import type { StocktakeSessionState } from "@vuarau/domain-kernel";
import { stocktakeDto } from "@vuarau/domain-kernel";
import type { Repositories } from "../../ports.ts";
import type { Store } from "../store.ts";
import { key } from "../store.ts";

function toDto(store: Store, session: StocktakeSessionState): StocktakeDto {
  const counts = [...store.stocktakeCounts.values()]
    .filter((count) => count.workspaceId === session.workspaceId && count.sessionId === session.id)
    .sort((left, right) =>
      left.recordedAt === right.recordedAt
        ? left.id.localeCompare(right.id)
        : left.recordedAt.localeCompare(right.recordedAt),
    );
  return stocktakeDto({ ...session, counts });
}

export const createStocktakeReads = (store: Store): Pick<Repositories, "stocktakeReads"> => ({
  stocktakeReads: {
    get: async (workspaceId, sessionId): Promise<StocktakeDto | null> => {
      const session = store.stocktakeSessions.get(key(workspaceId, sessionId));
      return session === undefined ? null : toDto(store, session);
    },
    findActiveByScope: async (workspaceId, scopeReference): Promise<StocktakeDto | null> => {
      const match = [...store.stocktakeSessions.values()].find(
        (s) =>
          s.workspaceId === workspaceId &&
          s.scopeReference === scopeReference &&
          (s.status === "draft" || s.status === "reopened"),
      );
      return match === undefined ? null : toDto(store, match);
    },
    findLatestByScope: async (workspaceId, scopeReference): Promise<StocktakeDto | null> => {
      const matching = [...store.stocktakeSessions.values()]
        .filter((s) => s.workspaceId === workspaceId && s.scopeReference === scopeReference)
        .sort((left, right) => {
          const timeComp = right.recordedAt.localeCompare(left.recordedAt);
          if (timeComp !== 0) return timeComp;
          return right.id.localeCompare(left.id);
        });
      const match = matching[0];
      return match === undefined ? null : toDto(store, match);
    },
  },
});
