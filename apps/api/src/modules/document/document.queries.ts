import type { DocumentGetInput, DocumentSourceInput } from "@vuarau/domain-contracts";
import { err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery } from "../shared/read-pipeline.ts";

export async function getDocument(ctx: CommandContext, input: DocumentGetInput) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "document.read",
    execute: ({ repos }) => repos.documentReads.get(input.workspaceId, input.documentId),
  });
  if (!result.ok) return result;
  return result.value === null ? err("DOCUMENT_NOT_FOUND", "No such Document.") : ok(result.value);
}

export const listDocumentsForSource = (ctx: CommandContext, input: DocumentSourceInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "document.read",
    execute: ({ repos }) =>
      repos.documentReads.listBySource(input.workspaceId, input.sourceType, input.sourceId),
  });
