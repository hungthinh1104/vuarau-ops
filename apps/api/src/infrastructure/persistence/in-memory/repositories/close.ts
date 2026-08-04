import type { Repositories } from "../../ports.ts";
import type { Store } from "../store.ts";
import { key } from "../store.ts";

export const createCloseRepositories = (
  store: Store,
): Pick<Repositories, "operationalCloses" | "cashStatementMatches"> => ({
  operationalCloses: {
    findByIdForUpdate: async (workspaceId, operationalCloseId) =>
      store.operationalCloses.get(key(workspaceId, operationalCloseId)) ?? null,
    findByBusinessDate: async (workspaceId, businessDate) =>
      [...store.operationalCloses.values()].find(
        (close) => close.workspaceId === workspaceId && close.businessDate === businessDate,
      ) ?? null,
    insert: async (close) => {
      const closeKey = key(close.workspaceId, close.id);
      if (
        store.operationalCloses.has(closeKey) ||
        [...store.operationalCloses.values()].some(
          (current) =>
            current.workspaceId === close.workspaceId &&
            current.businessDate === close.businessDate,
        )
      ) {
        return false;
      }
      store.operationalCloses.set(closeKey, {
        ...close,
        observationIds: [...close.observationIds],
        evidenceReferences: [...close.evidenceReferences],
      });
      return true;
    },
    insertReopen: async (workspaceId, operationalCloseId, reopen) => {
      const current = store.operationalCloses.get(key(workspaceId, operationalCloseId));
      if (current === undefined || current.reopen !== null) return false;
      store.operationalCloses.set(key(workspaceId, operationalCloseId), {
        ...current,
        state: "reopened",
        version: current.version + 1,
        reopen: { ...reopen, evidenceReferences: [...reopen.evidenceReferences] },
      });
      return true;
    },
  },
  cashStatementMatches: {
    findByIdForUpdate: async (workspaceId, cashStatementMatchId) =>
      store.cashStatementMatches.get(key(workspaceId, cashStatementMatchId)) ?? null,
    findByMovementId: async (workspaceId, cashMovementId) =>
      [...store.cashStatementMatches.values()].find(
        (match) =>
          match.workspaceId === workspaceId &&
          match.cashMovementId === cashMovementId &&
          match.reversal === null,
      ) ?? null,
    findByExternalReference: async (workspaceId, externalReference) =>
      [...store.cashStatementMatches.values()].find(
        (match) =>
          match.workspaceId === workspaceId &&
          match.externalReference === externalReference &&
          match.reversal === null,
      ) ?? null,
    insert: async (match) => {
      const duplicate = [...store.cashStatementMatches.values()].some(
        (current) =>
          current.workspaceId === match.workspaceId &&
          current.reversal === null &&
          (current.id === match.id ||
            current.cashMovementId === match.cashMovementId ||
            current.externalReference === match.externalReference),
      );
      if (duplicate) return false;
      store.cashStatementMatches.set(key(match.workspaceId, match.id), {
        ...match,
        evidenceReferences: [...match.evidenceReferences],
      });
      return true;
    },
    insertReversal: async (reversal) => {
      const match = store.cashStatementMatches.get(
        key(reversal.workspaceId, reversal.cashStatementMatchId),
      );
      if (match === undefined || match.reversal !== null) return false;
      store.cashStatementMatches.set(key(match.workspaceId, match.id), {
        ...match,
        version: match.version + 1,
        reversal: {
          id: reversal.id,
          reason: reversal.reason,
          evidenceReferences: [...reversal.evidenceReferences],
          transactionTime: reversal.transactionTime,
          recordedAt: reversal.recordedAt,
          actorId: reversal.actorId,
          commandId: reversal.commandId,
        },
      });
      return true;
    },
  },
});
