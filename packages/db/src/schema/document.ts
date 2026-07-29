import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { actors, workspaces } from "./workspace.ts";
import { documentSourceTypeEnum, documentTypeEnum } from "./enums.ts";

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    documentType: documentTypeEnum("document_type").notNull(),
    sourceType: documentSourceTypeEnum("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    digest: text("digest").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    generatedBy: uuid("generated_by")
      .notNull()
      .references(() => actors.id),
  },
  (table) => [
    uniqueIndex("documents_workspace_id_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("documents_source_version_uq").on(
      table.workspaceId,
      table.documentType,
      table.sourceType,
      table.sourceId,
      table.version,
    ),
    index("documents_source_idx").on(
      table.workspaceId,
      table.sourceType,
      table.sourceId,
      table.version,
    ),
  ],
);

export const documentShares = pgTable(
  "document_shares",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => actors.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => actors.id),
    revocationReason: text("revocation_reason"),
  },
  (table) => [
    uniqueIndex("document_shares_token_hash_uq").on(table.tokenHash),
    uniqueIndex("document_shares_workspace_id_id_uq").on(table.workspaceId, table.id),
    index("document_shares_document_idx").on(table.workspaceId, table.documentId),
  ],
);
