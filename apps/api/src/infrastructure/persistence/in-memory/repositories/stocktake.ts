import type { Repositories } from "../../ports.ts";
import type { StocktakeCountState, StocktakeSessionState } from "@vuarau/domain-kernel";
import type { Store } from "../store.ts";
import { key } from "../store.ts";

function countsFor(store: Store, session: StocktakeSessionState): readonly StocktakeCountState[] {
  return [...store.stocktakeCounts.values()]
    .filter((count) => count.workspaceId === session.workspaceId && count.sessionId === session.id)
    .sort((left, right) =>
      left.recordedAt === right.recordedAt
        ? left.id.localeCompare(right.id)
        : left.recordedAt.localeCompare(right.recordedAt),
    );
}

function withCounts(store: Store, session: StocktakeSessionState): StocktakeSessionState {
  return {
    ...session,
    counts: countsFor(store, session),
    varianceMovementIds: [...session.varianceMovementIds],
    evidenceReferences: [...session.evidenceReferences],
  };
}

export const createStocktakeRepositories = (store: Store): Pick<Repositories, "stocktakes"> => ({
  stocktakes: {
    findById: async (workspaceId, sessionId) => {
      const session = store.stocktakeSessions.get(key(workspaceId, sessionId));
      return session === undefined ? null : withCounts(store, session);
    },
    findByIdForUpdate: async (workspaceId, sessionId) => {
      const session = store.stocktakeSessions.get(key(workspaceId, sessionId));
      return session === undefined ? null : withCounts(store, session);
    },
    insert: async (session) => {
      const sessionKey = key(session.workspaceId, session.id);
      if (store.stocktakeSessions.has(sessionKey)) return false;
      store.stocktakeSessions.set(sessionKey, {
        ...session,
        counts: [],
        varianceMovementIds: [...session.varianceMovementIds],
        evidenceReferences: [...session.evidenceReferences],
      });
      return true;
    },
    insertCount: async (count) => {
      const countKey = key(count.workspaceId, count.id);
      if (
        store.stocktakeCounts.has(countKey) ||
        !store.stocktakeSessions.has(key(count.workspaceId, count.sessionId))
      ) {
        return false;
      }
      store.stocktakeCounts.set(countKey, {
        ...count,
        quantity: { ...count.quantity },
        evidenceReferences: [...count.evidenceReferences],
      });
      return true;
    },
    update: async (session, expectedVersion) => {
      const sessionKey = key(session.workspaceId, session.id);
      const current = store.stocktakeSessions.get(sessionKey);
      if (current === undefined || current.version !== expectedVersion) return false;
      store.stocktakeSessions.set(sessionKey, {
        ...session,
        counts: countsFor(store, session),
        varianceMovementIds: [...session.varianceMovementIds],
        evidenceReferences: [...session.evidenceReferences],
      });
      return true;
    },
  },
});
