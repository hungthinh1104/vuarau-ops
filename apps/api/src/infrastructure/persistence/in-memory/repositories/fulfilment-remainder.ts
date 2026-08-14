import type { Repositories } from "../../ports.ts";
import type { Store } from "../store.ts";
import { key } from "../store.ts";

export const createFulfilmentRemainderRepositories = (
  store: Store,
): Pick<Repositories, "fulfilmentRemainderCases"> => ({
  fulfilmentRemainderCases: {
    findById: async (workspaceId, caseId) =>
      store.fulfilmentRemainderCases.get(key(workspaceId, caseId)) ?? null,
    findByIdForUpdate: async (workspaceId, caseId) =>
      store.fulfilmentRemainderCases.get(key(workspaceId, caseId)) ?? null,
    findLatestForSale: async (workspaceId, saleId) =>
      [...store.fulfilmentRemainderCases.values()]
        .filter((row) => row.workspaceId === workspaceId && row.saleId === saleId)
        .sort((a, b) =>
          a.recordedAt === b.recordedAt
            ? b.id.localeCompare(a.id)
            : b.recordedAt.localeCompare(a.recordedAt),
        )[0] ?? null,
    findCorrectionByTarget: async (workspaceId, caseId) =>
      [...store.fulfilmentRemainderCases.values()].find(
        (row) => row.workspaceId === workspaceId && row.relatedCaseId === caseId,
      ) ?? null,
    insert: async (remainderCase) => {
      const caseKey = key(remainderCase.workspaceId, remainderCase.id);
      if (store.fulfilmentRemainderCases.has(caseKey)) return false;
      store.fulfilmentRemainderCases.set(caseKey, remainderCase);
      return true;
    },
  },
});
