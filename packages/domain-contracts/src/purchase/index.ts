import { z } from "zod";
import { defineCommand, defineVersionedCommand } from "../shared/command.ts";
import { currencyCodeSchema, moneySchema } from "../shared/money.ts";
import { pageOf, pageRequestSchema } from "../shared/pagination.ts";
import {
  productIdSchema,
  purchaseIdSchema,
  purchaseLineIdSchema,
  purchaseVoidIdSchema,
  supplierIdSchema,
  workspaceIdSchema,
  workspacePolicyVersionIdSchema,
} from "../shared/ids.ts";
import { quantitySchema } from "../shared/quantity.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { evidenceReferencesDtoSchema, evidenceReferencesInputSchema } from "../shared/evidence.ts";

export const PURCHASE_STATUSES = ["draft", "confirmed", "discarded"] as const;
export const purchaseStatusSchema = z.enum(PURCHASE_STATUSES);
export type PurchaseStatus = z.infer<typeof purchaseStatusSchema>;
export const purchaseVoidReasonCodeSchema = z.enum([
  "wrong_supplier",
  "wrong_product",
  "wrong_quantity",
  "wrong_price",
  "duplicate",
  "commercial_correction",
  "other",
]);
export type PurchaseVoidReasonCode = z.infer<typeof purchaseVoidReasonCodeSchema>;

export const purchaseLineInputSchema = z.object({
  lineId: purchaseLineIdSchema,
  productId: productIdSchema,
  productName: z.string().max(200),
  quantity: quantitySchema,
  unitPrice: moneySchema,
});
export type PurchaseLineInput = z.infer<typeof purchaseLineInputSchema>;

const purchaseDraftFields = z.object({
  purchaseId: purchaseIdSchema,
  supplierId: supplierIdSchema,
  currency: currencyCodeSchema,
  lines: z.array(purchaseLineInputSchema).max(100),
  note: z.string().trim().max(2_000).nullable().default(null),
  /** Source-linked supply evidence; it has no valuation or payable effect. */
  evidenceReferences: evidenceReferencesInputSchema,
  dueAt: isoInstantSchema.nullable().default(null),
  replacesPurchaseId: purchaseIdSchema.nullable().default(null),
});
export const createPurchaseDraftCommandSchema = defineCommand(purchaseDraftFields);
export type CreatePurchaseDraftCommand = z.infer<typeof createPurchaseDraftCommandSchema>;
export const updatePurchaseDraftCommandSchema = defineVersionedCommand(purchaseDraftFields);
export type UpdatePurchaseDraftCommand = z.infer<typeof updatePurchaseDraftCommandSchema>;
export const discardPurchaseDraftCommandSchema = defineVersionedCommand(
  z.object({ purchaseId: purchaseIdSchema, reason: z.string().trim().min(1).max(500) }),
);
export type DiscardPurchaseDraftCommand = z.infer<typeof discardPurchaseDraftCommandSchema>;
export const confirmPurchaseCommandSchema = defineVersionedCommand(
  z.object({ purchaseId: purchaseIdSchema }),
);
export type ConfirmPurchaseCommand = z.infer<typeof confirmPurchaseCommandSchema>;
export const voidPurchaseCommandSchema = defineCommand(
  z.object({
    purchaseVoidId: purchaseVoidIdSchema,
    purchaseId: purchaseIdSchema,
    reasonCode: purchaseVoidReasonCodeSchema,
    reason: z.string().trim().max(500),
    evidenceReferences: evidenceReferencesInputSchema,
  }),
);
export type VoidPurchaseCommand = z.infer<typeof voidPurchaseCommandSchema>;

export const purchaseLineDtoSchema = purchaseLineInputSchema.extend({
  lineTotal: moneySchema,
});
export type PurchaseLineDto = z.infer<typeof purchaseLineDtoSchema>;
export const purchaseVoidDtoSchema = z.object({
  id: purchaseVoidIdSchema,
  purchaseId: purchaseIdSchema,
  reasonCode: purchaseVoidReasonCodeSchema,
  reason: z.string(),
  evidenceReferences: evidenceReferencesDtoSchema,
  amount: moneySchema,
  policyVersionId: workspacePolicyVersionIdSchema.nullable().default(null),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
});
export type PurchaseVoidDto = z.infer<typeof purchaseVoidDtoSchema>;
export const purchaseDtoSchema = z.object({
  id: purchaseIdSchema,
  workspaceId: workspaceIdSchema,
  supplierId: supplierIdSchema,
  status: purchaseStatusSchema,
  currency: currencyCodeSchema,
  lines: z.array(purchaseLineDtoSchema),
  totalAmount: moneySchema,
  note: z.string().nullable(),
  evidenceReferences: evidenceReferencesDtoSchema,
  dueAt: isoInstantSchema.nullable(),
  version: z.int().positive(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  confirmedAt: isoInstantSchema.nullable(),
  discardedAt: isoInstantSchema.nullable(),
  replacesPurchaseId: purchaseIdSchema.nullable(),
  voidRecord: purchaseVoidDtoSchema.nullable(),
});
export type PurchaseDto = z.infer<typeof purchaseDtoSchema>;

export const purchaseGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  purchaseId: purchaseIdSchema,
});
export const purchaseListInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  supplierId: supplierIdSchema.nullable().default(null),
  status: purchaseStatusSchema.nullable().default(null),
});
export type PurchaseListInput = z.infer<typeof purchaseListInputSchema>;
export const purchaseListPageSchema = pageOf(purchaseDtoSchema);
