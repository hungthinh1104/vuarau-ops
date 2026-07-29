import type { DocumentGetInput, DocumentSourceInput } from "@vuarau/domain-contracts";
import { err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery } from "../shared/read-pipeline.ts";
import { hashPayload } from "../../infrastructure/hash.ts";

export async function getDocument(ctx: CommandContext, input: DocumentGetInput) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "document.read",
    execute: ({ repos }) => repos.documentReads.get(input.workspaceId, input.documentId),
  });
  if (!result.ok) return result;
  if (result.value === null) return err("DOCUMENT_NOT_FOUND", "No such Document.");
  if (hashPayload(result.value.snapshot) !== result.value.digest)
    return err("DOCUMENT_SOURCE_INVALID", "Document snapshot checksum does not match.");
  return ok(result.value);
}

export async function listDocumentsForSource(ctx: CommandContext, input: DocumentSourceInput) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "document.read",
    execute: ({ repos }) =>
      repos.documentReads.listBySource(input.workspaceId, input.sourceType, input.sourceId),
  });
  if (!result.ok) return result;
  if (result.value.some((document) => hashPayload(document.snapshot) !== document.digest))
    return err("DOCUMENT_SOURCE_INVALID", "A Document snapshot checksum does not match.");
  return ok(result.value);
}
