import { z } from "zod";
import { defineCommand } from "../shared/command.ts";
import { pageOf, pageRequestSchema } from "../shared/pagination.ts";
import {
  actorIdSchema,
  commandIdSchema,
  inventoryMovementIdSchema,
  productIdSchema,
  qualityGradeIdSchema,
  inventoryReclassificationIdSchema,
  purchaseIdSchema,
  purchaseLineIdSchema,
  purchaseReceiptIdSchema,
  purchaseReceiptLineIdSchema,
  purchaseReceiptReversalIdSchema,
  stocktakeCountIdSchema,
  stocktakeSessionIdSchema,
  workspacePolicyVersionIdSchema,
  workspaceIdSchema,
} from "../shared/ids.ts";
import { quantitySchema, unitSchema } from "../shared/quantity.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { capabilitySchema } from "../shared/capability.ts";
import { evidenceReferencesDtoSchema, evidenceReferencesInputSchema } from "../shared/evidence.ts";

export const receiptLineInputSchema = z.object({
  receiptLineId: purchaseReceiptLineIdSchema,
  purchaseLineId: purchaseLineIdSchema,
  productId: productIdSchema,
  qualityGradeId: qualityGradeIdSchema.nullable().default(null),
  qualityGradeName: z.string().trim().min(1).max(100).nullable().default(null),
  quantity: quantitySchema,
});
export const recordPurchaseReceiptCommandSchema = defineCommand(
  z.object({
    receiptId: purchaseReceiptIdSchema,
    purchaseId: purchaseIdSchema,
    lines: z.array(receiptLineInputSchema).min(1).max(100),
    note: z.string().trim().max(2_000).nullable().default(null),
    evidenceReferences: evidenceReferencesInputSchema,
  }),
);
export type RecordPurchaseReceiptCommand = z.infer<typeof recordPurchaseReceiptCommandSchema>;
export const reversePurchaseReceiptCommandSchema = defineCommand(
  z.object({
    reversalId: purchaseReceiptReversalIdSchema,
    receiptId: purchaseReceiptIdSchema,
    reasonCode: z.enum(["wrong_product", "wrong_quantity", "duplicate", "other"]),
    reason: z.string().trim().max(500),
    evidenceReferences: evidenceReferencesInputSchema,
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
    qualityGradeId: qualityGradeIdSchema.nullable().default(null),
    qualityGradeName: z.string().trim().min(1).max(100).nullable().default(null),
    quantity: quantitySchema,
    direction: z.enum(["increase", "decrease"]),
    reasonCode: inventoryAdjustmentReasonCodeSchema,
    reason: z.string().trim().max(500),
  }),
);
export type AdjustInventoryCommand = z.infer<typeof adjustInventoryCommandSchema>;

export const reclassifyInventoryCommandSchema = defineCommand(
  z.object({
    reclassificationId: inventoryReclassificationIdSchema,
    productId: productIdSchema,
    fromQualityGradeId: qualityGradeIdSchema,
    fromQualityGradeName: z.string().trim().min(1).max(100),
    toQualityGradeId: qualityGradeIdSchema,
    toQualityGradeName: z.string().trim().min(1).max(100),
    quantity: quantitySchema,
    reason: z.string().trim().max(500),
  }),
);
export type ReclassifyInventoryCommand = z.infer<typeof reclassifyInventoryCommandSchema>;

export const inventoryMovementSourceTypeSchema = z.enum([
  "purchase_receipt",
  "purchase_receipt_reversal",
  "inventory_adjustment",
  "delivery_dispatch",
  "delivery_return",
  "inventory_reclassification",
  "quality_disposition",
  "quality_disposition_reversal",
  "stocktake_variance",
]);
export type InventoryMovementSourceType = z.infer<typeof inventoryMovementSourceTypeSchema>;
export const inventoryMovementDtoSchema = z.object({
  id: inventoryMovementIdSchema,
  workspaceId: workspaceIdSchema,
  productId: productIdSchema,
  qualityGradeId: qualityGradeIdSchema.nullable(),
  qualityGradeName: z.string().nullable(),
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
      type: z.enum([
        "receipt",
        "inventory_adjustment",
        "inventory_reclassification",
        "delivery",
        "quality_disposition",
        "stocktake",
      ]),
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
  evidenceReferences: evidenceReferencesDtoSchema,
  reversal: z
    .object({
      id: purchaseReceiptReversalIdSchema,
      reasonCode: z.string(),
      reason: z.string(),
      transactionTime: isoInstantSchema,
      recordedAt: isoInstantSchema,
      evidenceReferences: evidenceReferencesDtoSchema,
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
export const purchaseReceivingSummaryDtoSchema = z.object({
  purchaseId: purchaseIdSchema,
  capabilities: z.object({
    voidPurchase: capabilitySchema,
    commercialCorrection: capabilitySchema,
  }),
  lines: z.array(
    z.object({
      purchaseLineId: purchaseLineIdSchema,
      productId: productIdSchema,
      productName: z.string(),
      ordered: quantitySchema,
      received: quantitySchema,
      remaining: quantitySchema,
    }),
  ),
});
export type PurchaseReceivingSummaryDto = z.infer<typeof purchaseReceivingSummaryDtoSchema>;
export const inventoryBalanceInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  productId: productIdSchema,
  qualityGradeId: qualityGradeIdSchema.nullable().optional(),
});
export const inventoryAdjustmentGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  adjustmentId: z.uuid(),
});
export const inventoryBalanceDtoSchema = z.object({
  workspaceId: workspaceIdSchema,
  productId: productIdSchema,
  qualityGradeId: qualityGradeIdSchema.nullable(),
  qualityGradeName: z.string().nullable(),
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
  qualityGradeId: qualityGradeIdSchema.nullable().optional(),
  unit: unitSchema.nullable().default(null),
});
export type InventoryTimelineInput = z.infer<typeof inventoryTimelineInputSchema>;
export const inventoryTimelinePageSchema = pageOf(inventoryMovementDtoSchema);
export const inventoryReconciliationDtoSchema = z.object({
  status: z.enum(["consistent", "inconsistent", "not_found", "integrity_failure"]),
  productId: productIdSchema,
  qualityGradeId: qualityGradeIdSchema.nullable().default(null),
  unit: unitSchema,
  projected: inventoryBalanceDtoSchema.nullable(),
  canonical: inventoryBalanceDtoSchema.nullable(),
  diagnostics: z.array(z.string()),
});
export type InventoryReconciliationDto = z.infer<typeof inventoryReconciliationDtoSchema>;

export const stockPlanningInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  asOf: isoInstantSchema,
});
export type StockPlanningInput = z.infer<typeof stockPlanningInputSchema>;
export const stockPlanningRowSchema = z.object({
  productId: productIdSchema,
  qualityGradeId: qualityGradeIdSchema.nullable(),
  unit: unitSchema,
  currentQuantity: quantitySchema,
  minimumQuantity: quantitySchema,
  targetQuantity: quantitySchema,
  suggestedQuantity: quantitySchema,
  reorderRequired: z.boolean(),
  sourceMovementIds: z.array(inventoryMovementIdSchema),
});
export type StockPlanningRow = z.infer<typeof stockPlanningRowSchema>;
export const stockPlanningDtoSchema = z.object({
  status: z.enum(["available", "unavailable"]),
  workspaceId: workspaceIdSchema,
  asOf: isoInstantSchema,
  policyVersionId: workspacePolicyVersionIdSchema.nullable(),
  strategy: z.string().nullable(),
  calculationVersion: z.literal("stock-planning-v1"),
  calculatedAt: isoInstantSchema,
  diagnostics: z.array(z.string()),
  rows: z.array(stockPlanningRowSchema),
});
export type StockPlanningDto = z.infer<typeof stockPlanningDtoSchema>;

export const STOCKTAKE_STATES = ["draft", "approved", "reopened"] as const;
export const stocktakeStateSchema = z.enum(STOCKTAKE_STATES);
export type StocktakeState = z.infer<typeof stocktakeStateSchema>;
export const startStocktakeCommandSchema = defineCommand(
  z.object({
    stocktakeSessionId: stocktakeSessionIdSchema,
    asOf: isoInstantSchema,
    scopeReference: z.string().trim().min(1).max(500),
    note: z.string().trim().max(2_000).nullable().default(null),
    evidenceReferences: evidenceReferencesInputSchema,
  }),
);
export type StartStocktakeCommand = z.infer<typeof startStocktakeCommandSchema>;
export const recordStocktakeCountCommandSchema = defineCommand(
  z.object({
    stocktakeCountId: stocktakeCountIdSchema,
    stocktakeSessionId: stocktakeSessionIdSchema,
    productId: productIdSchema,
    qualityGradeId: qualityGradeIdSchema.nullable().default(null),
    qualityGradeName: z.string().trim().min(1).max(100).nullable().default(null),
    quantity: quantitySchema,
    supersedesCountId: stocktakeCountIdSchema.nullable().default(null),
    evidenceReferences: evidenceReferencesInputSchema,
  }),
);
export type RecordStocktakeCountCommand = z.infer<typeof recordStocktakeCountCommandSchema>;
export const approveStocktakeCommandSchema = defineCommand(
  z.object({
    stocktakeSessionId: stocktakeSessionIdSchema,
    expectedVersion: z.int().positive(),
    evidenceReferences: evidenceReferencesInputSchema,
    reason: z.string().trim().min(1).max(500),
  }),
);
export type ApproveStocktakeCommand = z.infer<typeof approveStocktakeCommandSchema>;
export const reopenStocktakeCommandSchema = defineCommand(
  z.object({
    stocktakeSessionId: stocktakeSessionIdSchema,
    expectedVersion: z.int().positive(),
    evidenceReferences: evidenceReferencesInputSchema,
    reason: z.string().trim().min(1).max(500),
  }),
);
export type ReopenStocktakeCommand = z.infer<typeof reopenStocktakeCommandSchema>;
export const stocktakeGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  stocktakeSessionId: stocktakeSessionIdSchema,
});
export type StocktakeGetInput = z.infer<typeof stocktakeGetInputSchema>;
export const stocktakeCountDtoSchema = z.object({
  id: stocktakeCountIdSchema,
  workspaceId: workspaceIdSchema,
  sessionId: stocktakeSessionIdSchema,
  productId: productIdSchema,
  qualityGradeId: qualityGradeIdSchema.nullable(),
  qualityGradeName: z.string().nullable(),
  quantity: quantitySchema,
  supersedesCountId: stocktakeCountIdSchema.nullable(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  evidenceReferences: evidenceReferencesDtoSchema,
});
export type StocktakeCountDto = z.infer<typeof stocktakeCountDtoSchema>;
export const stocktakeDtoSchema = z.object({
  id: stocktakeSessionIdSchema,
  workspaceId: workspaceIdSchema,
  asOf: isoInstantSchema,
  scopeReference: z.string(),
  note: z.string().nullable(),
  status: stocktakeStateSchema,
  version: z.int().positive(),
  policyVersionId: workspacePolicyVersionIdSchema,
  counts: z.array(stocktakeCountDtoSchema),
  varianceMovementIds: z.array(inventoryMovementIdSchema),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  evidenceReferences: evidenceReferencesDtoSchema,
});
export type StocktakeDto = z.infer<typeof stocktakeDtoSchema>;
export const inventoryReconciliationInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  productId: productIdSchema,
  qualityGradeId: qualityGradeIdSchema.nullable().default(null),
  unit: unitSchema,
});
export const rebuildInventoryCommandSchema = defineCommand(
  z.object({
    productId: productIdSchema,
    qualityGradeId: qualityGradeIdSchema.nullable().default(null),
    unit: unitSchema,
  }),
);
export type RebuildInventoryCommand = z.infer<typeof rebuildInventoryCommandSchema>;
