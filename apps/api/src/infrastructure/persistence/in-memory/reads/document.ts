import type { Repositories } from "../../ports.ts";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

export const createDocumentReads = (store: Store): Pick<Repositories, "documentReads"> => ({
  documentReads: {
    get: async (workspaceId, documentId) =>
      store.documents.get(key(workspaceId, documentId)) ?? null,
    listBySource: async (workspaceId, sourceType, sourceId) =>
      [...store.documents.values()]
        .filter(
          (document) =>
            document.workspaceId === workspaceId &&
            document.sourceType === sourceType &&
            document.sourceId === sourceId,
        )
        .sort((a, b) => b.version - a.version || b.id.localeCompare(a.id)),
    publicByTokenHash: async (tokenHash, now) => {
      const share = [...store.documentShares.values()].find(
        (candidate) => candidate.tokenHash === tokenHash,
      );
      if (share === undefined) return { kind: "not_found" as const };
      if (share.revokedAt !== null) return { kind: "revoked" as const };
      if (share.expiresAt !== null && share.expiresAt < now) return { kind: "expired" as const };
      const document = store.documents.get(key(share.workspaceId, share.documentId));
      return document === undefined
        ? { kind: "not_found" as const }
        : { kind: "found" as const, document };
    },
  },
});
