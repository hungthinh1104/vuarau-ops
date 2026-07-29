import { z } from "zod";
import { defineCommand } from "../shared/command.ts";
import {
  actorIdSchema,
  documentIdSchema,
  documentShareIdSchema,
  workspaceIdSchema,
} from "../shared/ids.ts";
import { isoInstantSchema } from "../shared/time.ts";

export const DOCUMENT_TYPES = [
  "sale_receipt",
  "customer_statement",
  "purchase_order",
  "delivery_note",
] as const;
export const documentTypeSchema = z.enum(DOCUMENT_TYPES);
export type DocumentType = z.infer<typeof documentTypeSchema>;
export const documentSourceTypeSchema = z.enum(["sale", "customer", "purchase", "delivery"]);
export type DocumentSourceType = z.infer<typeof documentSourceTypeSchema>;
export const generateDocumentCommandSchema = defineCommand(
  z.object({
    documentId: documentIdSchema,
    documentType: documentTypeSchema,
    sourceType: documentSourceTypeSchema,
    sourceId: z.uuid(),
  }),
);
export type GenerateDocumentCommand = z.infer<typeof generateDocumentCommandSchema>;
export const createDocumentShareCommandSchema = defineCommand(
  z.object({
    shareId: documentShareIdSchema,
    documentId: documentIdSchema,
    expiresAt: isoInstantSchema.nullable().default(null),
  }),
);
export type CreateDocumentShareCommand = z.infer<typeof createDocumentShareCommandSchema>;
export const revokeDocumentShareCommandSchema = defineCommand(
  z.object({ shareId: documentShareIdSchema, reason: z.string().trim().min(1).max(500) }),
);
export type RevokeDocumentShareCommand = z.infer<typeof revokeDocumentShareCommandSchema>;
export const documentDtoSchema = z.object({
  id: documentIdSchema,
  workspaceId: workspaceIdSchema,
  documentType: documentTypeSchema,
  sourceType: documentSourceTypeSchema,
  sourceId: z.uuid(),
  version: z.int().positive(),
  snapshot: z.record(z.string(), z.unknown()),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  generatedAt: isoInstantSchema,
  generatedBy: actorIdSchema,
});
export type DocumentDto = z.infer<typeof documentDtoSchema>;
export const documentGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  documentId: documentIdSchema,
});
export type DocumentGetInput = z.infer<typeof documentGetInputSchema>;
export const documentSourceInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  sourceType: documentSourceTypeSchema,
  sourceId: z.uuid(),
});
export type DocumentSourceInput = z.infer<typeof documentSourceInputSchema>;
export const documentShareResultDtoSchema = z.object({
  shareId: documentShareIdSchema,
  documentId: documentIdSchema,
  token: z.string().min(32),
  expiresAt: isoInstantSchema.nullable(),
});
export type DocumentShareResultDto = z.infer<typeof documentShareResultDtoSchema>;
