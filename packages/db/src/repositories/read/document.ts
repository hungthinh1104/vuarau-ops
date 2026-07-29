import { and, desc, eq } from "drizzle-orm";
import { documents, documentShares } from "../../schema/index.ts";
import { fromIso } from "../row-mappers.ts";
import { toDocumentDto } from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";

export const createDocumentReadRepositories = (tx: Tx) => ({
  documentReads: {
    async get(workspaceId: string, documentId: string) {
      const rows = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, documentId)))
        .limit(1);
      return rows[0] === undefined ? null : toDocumentDto(rows[0]);
    },
    async listBySource(workspaceId: string, sourceType: string, sourceId: string) {
      const rows = await tx
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.workspaceId, workspaceId),
            eq(documents.sourceType, sourceType as typeof documents.$inferSelect.sourceType),
            eq(documents.sourceId, sourceId),
          ),
        )
        .orderBy(desc(documents.version), desc(documents.id));
      return rows.map(toDocumentDto);
    },
    async publicByTokenHash(tokenHash: string, now: string) {
      const rows = await tx
        .select({ share: documentShares, document: documents })
        .from(documentShares)
        .innerJoin(documents, eq(documents.id, documentShares.documentId))
        .where(eq(documentShares.tokenHash, tokenHash))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return { kind: "not_found" as const };
      if (row.share.revokedAt !== null) return { kind: "revoked" as const };
      if (row.share.expiresAt !== null && row.share.expiresAt < fromIso(now as never))
        return { kind: "expired" as const };
      return { kind: "found" as const, document: toDocumentDto(row.document) };
    },
  },
});
