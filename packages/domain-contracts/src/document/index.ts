import { z } from "zod";
import {
  accountTimelineEntryDtoSchema,
  balanceClassificationSchema,
  customerAccountEntryDtoSchema,
} from "../account/index.ts";
import { deliveryDtoSchema } from "../delivery/index.ts";
import { purchaseDtoSchema } from "../purchase/index.ts";
import { saleLineDtoSchema } from "../sale/index.ts";
import { supplierDtoSchema } from "../supplier/index.ts";
import { defineCommand } from "../shared/command.ts";
import {
  actorIdSchema,
  customerIdSchema,
  documentIdSchema,
  documentShareIdSchema,
  saleIdSchema,
  workspaceIdSchema,
} from "../shared/ids.ts";
import { currencyCodeSchema, moneySchema } from "../shared/money.ts";
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

export const documentPeriodSchema = z
  .object({
    from: isoInstantSchema.nullable().default(null),
    to: isoInstantSchema.nullable().default(null),
  })
  .superRefine((period, ctx) => {
    if (
      period.from !== null &&
      period.to !== null &&
      Date.parse(period.from) > Date.parse(period.to)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "Document period end must be on or after its start.",
      });
    }
  });
export type DocumentPeriod = z.infer<typeof documentPeriodSchema>;

const generateDocumentPayloadSchema = z
  .object({
    documentId: documentIdSchema,
    documentType: documentTypeSchema,
    sourceType: documentSourceTypeSchema,
    sourceId: z.uuid(),
    period: documentPeriodSchema.nullable().default(null),
  })
  .superRefine((payload, ctx) => {
    if (payload.documentType !== "customer_statement" && payload.period !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["period"],
        message: "Only a customer statement may carry a multi-day period.",
      });
    }
  });

export const generateDocumentCommandSchema = defineCommand(generateDocumentPayloadSchema);
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

const documentWorkspaceSnapshotSchema = z.object({ id: workspaceIdSchema, name: z.string() });
const documentCustomerSnapshotSchema = z.object({
  id: customerIdSchema,
  displayName: z.string(),
  phone: z.string().nullable(),
});

const saleDocumentFactSchema = z.object({
  id: saleIdSchema,
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  currency: currencyCodeSchema,
  lines: z.array(saleLineDtoSchema),
  totalAmount: moneySchema,
  note: z.string().nullable(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  postedAt: isoInstantSchema.nullable(),
  dueAt: isoInstantSchema.nullable(),
  replacesSaleId: saleIdSchema.nullable(),
});

export const saleReceiptSnapshotSchema = z.object({
  kind: z.literal("sale_receipt"),
  schemaVersion: z.literal(1),
  workspace: documentWorkspaceSnapshotSchema,
  customer: documentCustomerSnapshotSchema,
  sale: saleDocumentFactSchema,
  accountEffect: customerAccountEntryDtoSchema,
});

export const customerStatementSnapshotSchema = z.object({
  kind: z.literal("customer_statement"),
  schemaVersion: z.literal(1),
  workspace: documentWorkspaceSnapshotSchema,
  customer: documentCustomerSnapshotSchema,
  period: documentPeriodSchema,
  openingBalance: moneySchema,
  entries: z.array(accountTimelineEntryDtoSchema),
  periodChange: moneySchema,
  closingBalance: moneySchema,
  classification: balanceClassificationSchema,
});

export const purchaseOrderSnapshotSchema = z.object({
  kind: z.literal("purchase_order"),
  schemaVersion: z.literal(1),
  workspace: documentWorkspaceSnapshotSchema,
  supplier: supplierDtoSchema,
  purchase: purchaseDtoSchema,
});

export const deliveryNoteSnapshotSchema = z.object({
  kind: z.literal("delivery_note"),
  schemaVersion: z.literal(1),
  workspace: documentWorkspaceSnapshotSchema,
  customer: documentCustomerSnapshotSchema,
  sale: z.object({ id: saleIdSchema, transactionTime: isoInstantSchema }),
  delivery: deliveryDtoSchema,
});

export const documentSnapshotSchema = z.discriminatedUnion("kind", [
  saleReceiptSnapshotSchema,
  customerStatementSnapshotSchema,
  purchaseOrderSnapshotSchema,
  deliveryNoteSnapshotSchema,
]);
export type DocumentSnapshot = z.infer<typeof documentSnapshotSchema>;

export const documentDtoSchema = z.object({
  id: documentIdSchema,
  workspaceId: workspaceIdSchema,
  documentType: documentTypeSchema,
  sourceType: documentSourceTypeSchema,
  sourceId: z.uuid(),
  version: z.int().positive(),
  /** Legacy snapshots predate the typed `kind`; authenticated reads still verify their digest. */
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
  expiresAt: isoInstantSchema,
});
export type DocumentShareResultDto = z.infer<typeof documentShareResultDtoSchema>;
