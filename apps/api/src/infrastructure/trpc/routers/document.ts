import {
  generateDocumentCommandSchema,
  createDocumentShareCommandSchema,
  revokeDocumentShareCommandSchema,
  documentGetInputSchema,
  documentSourceInputSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "../trpc.ts";
import {
  createDocumentShare,
  generateDocument,
  revokeDocumentShare,
} from "../../../modules/document/document.handlers.ts";
import { getDocument, listDocumentsForSource } from "../../../modules/document/document.queries.ts";

export const documentRouter = router({
  generate: commandProcedure
    .input(generateDocumentCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await generateDocument(ctx, input))),
  share: commandProcedure
    .input(createDocumentShareCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createDocumentShare(ctx, input))),
  revokeShare: commandProcedure
    .input(revokeDocumentShareCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await revokeDocumentShare(ctx, input))),
  get: authenticatedProcedure
    .input(documentGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getDocument(ctx, input))),
  listForSource: authenticatedProcedure
    .input(documentSourceInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listDocumentsForSource(ctx, input))),
});
