import type { Repositories } from "../../ports.ts";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

export const createDocumentRepositories = (store: Store): Pick<Repositories, "documents"> => ({
  documents: {
    nextVersion: async ({ workspaceId, documentType, sourceType, sourceId }) =>
      Math.max(
        0,
        ...[...store.documents.values()]
          .filter(
            (document) =>
              document.workspaceId === workspaceId &&
              document.documentType === documentType &&
              document.sourceType === sourceType &&
              document.sourceId === sourceId,
          )
          .map((document) => document.version),
      ) + 1,
    insert: async (document) => {
      const documentKey = key(document.workspaceId, document.id);
      if (
        store.documents.has(documentKey) ||
        [...store.documents.values()].some(
          (candidate) =>
            candidate.workspaceId === document.workspaceId &&
            candidate.documentType === document.documentType &&
            candidate.sourceType === document.sourceType &&
            candidate.sourceId === document.sourceId &&
            candidate.version === document.version,
        )
      )
        return false;
      store.documents.set(documentKey, document);
      return true;
    },
    get: async (workspaceId, documentId) =>
      store.documents.get(key(workspaceId, documentId)) ?? null,
    insertShare: async (share) => {
      if (
        store.documentShares.has(key(share.workspaceId, share.id)) ||
        [...store.documentShares.values()].some(
          (candidate) => candidate.tokenHash === share.tokenHash,
        )
      )
        return false;
      store.documentShares.set(key(share.workspaceId, share.id), {
        ...share,
        revokedAt: null,
        revokedBy: null,
        revokeReason: null,
      });
      return true;
    },
    revokeShare: async (args) => {
      const shareKey = key(args.workspaceId, args.shareId);
      const current = store.documentShares.get(shareKey);
      if (current === undefined || current.revokedAt !== null) return false;
      store.documentShares.set(shareKey, {
        ...current,
        revokedAt: args.revokedAt,
        revokedBy: args.revokedBy,
        revokeReason: args.reason,
      });
      return true;
    },
  },
});
