import { z } from "zod";
import { defineCommand } from "../shared/command.ts";
import { pageOf, pageRequestSchema } from "../shared/pagination.ts";
import {
  actorIdSchema,
  commandIdSchema,
  inventoryMovementIdSchema,
  productIdSchema,
  purchaseIdSchema,
  purchaseLineIdSchema,
  purchaseReceiptIdSchema,
  purchaseReceiptLineIdSchema,
  purchaseReceiptReversalIdSchema,
  workspaceIdSchema,
} from "../shared/ids.ts";
import { quantitySchema, unitSchema } from "../shared/quantity.ts";
import { isoInstantSchema } from "../shared/time.ts";

export const receiptLineInputSchema = z.object({
  receiptLineId: purchaseReceiptLineIdSchema,
  purchaseLineId: purchaseLineIdSchema,
  productId: productIdSchema,
  quantity: quantitySchema,
});
export const recordPurchaseReceiptCommandSchema = defineCommand(
  z.object({
    receiptId: purchaseReceiptIdSchema,
    purchaseId: purchaseIdSchema,
    lines: z.array(receiptLineInputSchema).min(1).max(100),
    note: z.string().trim().max(2_000).nullable().default(null),
  }),
);
export type RecordPurchaseReceiptCommand = z.infer<typeof recordPurchaseReceiptCommandSchema>;
export const reversePurchaseReceiptCommandSchema = defineCommand(
  z.object({
    reversalId: purchaseReceiptReversalIdSchema,
    receiptId: purchaseReceiptIdSchema,
    reasonCode: z.enum(["wrong_product", "wrong_quantity", "duplicate", "other"]),
    reason: z.string().trim().max(500),
  }),
);
export type ReversePurchaseReceiptCommand = z.infer<typeof reversePurchaseReceiptCommandSchema>;

export const inventoryAdjustmentReasonCodeSchema = z.enum([
  "opening_balance",
  "count_correction",
  "spoilage",
  "shrinkage",
  "other",
]);
export const adjustInventoryCommandSchema = defineCommand(
  z.object({
    adjustmentId: z.uuid(),
    productId: productIdSchema,
    quantity: quantitySchema,
    direction: z.enum(["increase", "decrease"]),
    reasonCode: inventoryAdjustmentReasonCodeSchema,
    reason: z.string().trim().max(500),
  }),
);
export type AdjustInventoryCommand = z.infer<typeof adjustInventoryCommandSchema>;

export const inventoryMovementSourceTypeSchema = z.enum([
  "purchase_receipt",
  "purchase_receipt_reversal",
  "inventory_adjustment",
]);
export type InventoryMovementSourceType = z.infer<typeof inventoryMovementSourceTypeSchema>;
export const inventoryMovementDtoSchema = z.object({
  id: inventoryMovementIdSchema,
  workspaceId: workspaceIdSchema,
  productId: productIdSchema,
  quantity: quantitySchema,
  sourceType: inventoryMovementSourceTypeSchema,
  sourceId: z.uuid(),
  sourceLineId: z.uuid().nullable(),
  reversalOfMovementId: inventoryMovementIdSchema.nullable(),
  reasonCode: z.string().nullable(),
  reason: z.string().nullable(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
  sourceDocument: z
    .object({
      type: z.enum(["receipt", "inventory_adjustment"]),
      id: z.uuid(),
    })
    .optional(),
});
export type InventoryMovementDto = z.infer<typeof inventoryMovementDtoSchema>;

export const purchaseReceiptDtoSchema = z.object({
  id: purchaseReceiptIdSchema,
  workspaceId: workspaceIdSchema,
  purchaseId: purchaseIdSchema,
  lines: z.array(receiptLineInputSchema),
  note: z.string().nullable(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  reversal: z
    .object({
      id: purchaseReceiptReversalIdSchema,
      reasonCode: z.string(),
      reason: z.string(),
      transactionTime: isoInstantSchema,
      recordedAt: isoInstantSchema,
    })
    .nullable(),
});
export type PurchaseReceiptDto = z.infer<typeof purchaseReceiptDtoSchema>;

export const receiptGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  receiptId: purchaseReceiptIdSchema,
});
export const purchaseReceiptsInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  purchaseId: purchaseIdSchema,
});
export const inventoryBalanceInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  productId: productIdSchema,
});
export const inventoryAdjustmentGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  adjustmentId: z.uuid(),
});
export const inventoryBalanceDtoSchema = z.object({
  workspaceId: workspaceIdSchema,
  productId: productIdSchema,
  unit: unitSchema,
  quantityScaled: z.int(),
  classification: z.enum(["positive", "zero", "negative"]),
  movementCount: z.int().nonnegative(),
  lastMovementTransactionTime: isoInstantSchema.nullable(),
  updatedAt: isoInstantSchema,
});
export type InventoryBalanceDto = z.infer<typeof inventoryBalanceDtoSchema>;
export const inventoryTimelineInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  productId: productIdSchema,
  unit: unitSchema.nullable().default(null),
});
export type InventoryTimelineInput = z.infer<typeof inventoryTimelineInputSchema>;
export const inventoryTimelinePageSchema = pageOf(inventoryMovementDtoSchema);
export const inventoryReconciliationDtoSchema = z.object({
  status: z.enum(["consistent", "inconsistent", "not_found", "integrity_failure"]),
  productId: productIdSchema,
  unit: unitSchema,
  projected: inventoryBalanceDtoSchema.nullable(),
  canonical: inventoryBalanceDtoSchema.nullable(),
  diagnostics: z.array(z.string()),
});
export type InventoryReconciliationDto = z.infer<typeof inventoryReconciliationDtoSchema>;
export const inventoryReconciliationInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  productId: productIdSchema,
  unit: unitSchema,
});
export const rebuildInventoryCommandSchema = defineCommand(
  z.object({
    productId: productIdSchema,
    unit: unitSchema,
  }),
);
export type RebuildInventoryCommand = z.infer<typeof rebuildInventoryCommandSchema>;
