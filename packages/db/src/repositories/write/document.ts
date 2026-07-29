import { and, eq, sql } from "drizzle-orm";
import type {
  ActorId,
  IsoInstant,
  WorkspaceId,
  DocumentDto,
  DocumentSourceType,
  DocumentType,
} from "@vuarau/domain-contracts";
import { documents, documentShares } from "../../schema/index.ts";
import { fromIso, fromIsoOrNull, toIso } from "../row-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createDocumentWriteRepositories = (tx: Tx) => ({
  documents: {
    async nextVersion(args: {
      workspaceId: WorkspaceId;
      documentType: DocumentType;
      sourceType: DocumentSourceType;
      sourceId: string;
    }) {
      await tx.execute(sql`select pg_advisory_xact_lock(
          hashtextextended(
            ${`${args.workspaceId}:${args.documentType}:${args.sourceType}:${args.sourceId}`},
            0
          )
        )`);
      const rows = await tx
        .select({ version: sql<number>`coalesce(max(${documents.version}), 0) + 1` })
        .from(documents)
        .where(
          and(
            eq(documents.workspaceId, args.workspaceId),
            eq(documents.documentType, args.documentType),
            eq(documents.sourceType, args.sourceType),
            eq(documents.sourceId, args.sourceId),
          ),
        );
      return Number(rows[0]?.version ?? 1);
    },
    async insert(document: DocumentDto) {
      const rows = await tx
        .insert(documents)
        .values({
          id: document.id,
          workspaceId: document.workspaceId,
          documentType: document.documentType,
          sourceType: document.sourceType,
          sourceId: document.sourceId,
          version: document.version,
          snapshot: document.snapshot,
          digest: document.digest,
          generatedAt: fromIso(document.generatedAt),
          generatedBy: document.generatedBy,
        })
        .onConflictDoNothing()
        .returning({ id: documents.id });
      return rows.length === 1;
    },
    async get(workspaceId: WorkspaceId, documentId: string) {
      const rows = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, documentId)))
        .limit(1);
      const row = rows[0];
      return row === undefined
        ? null
        : ({
            id: row.id,
            workspaceId: row.workspaceId,
            documentType: row.documentType,
            sourceType: row.sourceType,
            sourceId: row.sourceId,
            version: row.version,
            snapshot: row.snapshot as Record<string, unknown>,
            digest: row.digest,
            generatedAt: toIso(row.generatedAt),
            generatedBy: row.generatedBy,
          } as DocumentDto);
    },
    async insertShare(share: {
      id: string;
      workspaceId: WorkspaceId;
      documentId: string;
      tokenHash: string;
      expiresAt: IsoInstant | null;
      createdAt: IsoInstant;
      createdBy: ActorId;
    }) {
      const rows = await tx
        .insert(documentShares)
        .values({
          id: share.id,
          workspaceId: share.workspaceId,
          documentId: share.documentId,
          tokenHash: share.tokenHash,
          expiresAt: fromIsoOrNull(share.expiresAt),
          createdAt: fromIso(share.createdAt),
          createdBy: share.createdBy,
        })
        .onConflictDoNothing()
        .returning({ id: documentShares.id });
      return rows.length === 1;
    },
    async revokeShare(args: {
      workspaceId: WorkspaceId;
      shareId: string;
      revokedAt: IsoInstant;
      revokedBy: ActorId;
      reason: string;
    }) {
      const rows = await tx
        .update(documentShares)
        .set({
          revokedAt: fromIso(args.revokedAt),
          revokedBy: args.revokedBy,
          revocationReason: args.reason,
        })
        .where(
          and(
            eq(documentShares.workspaceId, args.workspaceId),
            eq(documentShares.id, args.shareId),
            sql`${documentShares.revokedAt} is null`,
          ),
        )
        .returning({ id: documentShares.id });
      return rows.length === 1;
    },
  },
});
