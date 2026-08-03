import { z } from "zod";
import { defineCommand, defineVersionedCommand } from "../shared/command.ts";
import {
  actorIdSchema,
  commandIdSchema,
  goodsArrivalIdSchema,
  goodsArrivalLineIdSchema,
  goodsArrivalReversalIdSchema,
  productIdSchema,
  purchaseIdSchema,
  purchaseLineIdSchema,
  qualityDispositionAllocationIdSchema,
  qualityDispositionIdSchema,
  qualityDispositionReversalIdSchema,
  qualityGradeIdSchema,
  qualityInspectionIdSchema,
  qualityInspectionReversalIdSchema,
  qualityIssueCodeIdSchema,
  supplierIdSchema,
  workspaceIdSchema,
} from "../shared/ids.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { pageOf, pageRequestSchema } from "../shared/pagination.ts";
import { quantitySchema } from "../shared/quantity.ts";
import { evidenceReferencesDtoSchema, evidenceReferencesInputSchema } from "../shared/evidence.ts";

export const QUALITY_ISSUE_CATEGORIES = ["condition", "defect"] as const;
export const qualityIssueCategorySchema = z.enum(QUALITY_ISSUE_CATEGORIES);
export const QUALITY_SEVERITIES = ["minor", "moderate", "severe"] as const;
export const qualitySeveritySchema = z.enum(QUALITY_SEVERITIES);

const issueCodeFields = z.object({
  qualityIssueCodeId: qualityIssueCodeIdSchema,
  code: z.string().trim().min(1).max(50),
  displayName: z.string().trim().min(1).max(200),
  category: qualityIssueCategorySchema,
  description: z.string().trim().max(1_000).nullable().default(null),
});
export const createQualityIssueCodeCommandSchema = defineCommand(issueCodeFields);
export const updateQualityIssueCodeCommandSchema = defineVersionedCommand(issueCodeFields);
const issueLifecycleFields = z.object({
  qualityIssueCodeId: qualityIssueCodeIdSchema,
  reason: z.string().trim().min(1).max(500),
});
export const deactivateQualityIssueCodeCommandSchema = defineVersionedCommand(issueLifecycleFields);
export const reactivateQualityIssueCodeCommandSchema = defineVersionedCommand(issueLifecycleFields);
export type CreateQualityIssueCodeCommand = z.infer<typeof createQualityIssueCodeCommandSchema>;
export type UpdateQualityIssueCodeCommand = z.infer<typeof updateQualityIssueCodeCommandSchema>;
export type DeactivateQualityIssueCodeCommand = z.infer<
  typeof deactivateQualityIssueCodeCommandSchema
>;
export type ReactivateQualityIssueCodeCommand = z.infer<
  typeof reactivateQualityIssueCodeCommandSchema
>;

export const qualityIssueCodeDtoSchema = z.object({
  id: qualityIssueCodeIdSchema,
  workspaceId: workspaceIdSchema,
  code: z.string(),
  displayName: z.string(),
  category: qualityIssueCategorySchema,
  description: z.string().nullable(),
  isActive: z.boolean(),
  version: z.int().positive(),
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
});
export type QualityIssueCodeDto = z.infer<typeof qualityIssueCodeDtoSchema>;

const massQuantitySchema = quantitySchema.superRefine((quantity, ctx) => {
  if (!(["kg", "gram", "lang"] as const).includes(quantity.unit as "kg")) {
    ctx.addIssue({ code: "custom", message: "Weight unit must be kg, gram or lạng." });
  }
});
export const weighingObservationSchema = z
  .object({
    containerCount: z.int().nonnegative().nullable().default(null),
    grossWeight: massQuantitySchema,
    tareWeight: massQuantitySchema,
    netWeight: massQuantitySchema,
  })
  .superRefine((measurement, ctx) => {
    if (
      measurement.grossWeight.unit !== measurement.tareWeight.unit ||
      measurement.grossWeight.unit !== measurement.netWeight.unit
    ) {
      ctx.addIssue({ code: "custom", message: "Gross, tare and net weight must use one unit." });
      return;
    }
    if (
      measurement.grossWeight.valueScaled <= 0 ||
      measurement.tareWeight.valueScaled < 0 ||
      measurement.netWeight.valueScaled <= 0 ||
      measurement.grossWeight.valueScaled - measurement.tareWeight.valueScaled !==
        measurement.netWeight.valueScaled
    ) {
      ctx.addIssue({ code: "custom", message: "Net weight must equal gross minus tare." });
    }
  });
export type WeighingObservation = z.infer<typeof weighingObservationSchema>;

export const goodsArrivalLineInputSchema = z.object({
  arrivalLineId: goodsArrivalLineIdSchema,
  purchaseLineId: purchaseLineIdSchema.nullable().default(null),
  productId: productIdSchema,
  productName: z.string().trim().min(1).max(200),
  arrivedQuantity: quantitySchema,
  weighing: weighingObservationSchema.nullable().default(null),
  supplierLotCode: z.string().trim().max(200).nullable().default(null),
  note: z.string().trim().max(1_000).nullable().default(null),
});
export type GoodsArrivalLineInput = z.infer<typeof goodsArrivalLineInputSchema>;

export const recordGoodsArrivalCommandSchema = defineCommand(
  z
    .object({
      arrivalId: goodsArrivalIdSchema,
      supplierId: supplierIdSchema,
      purchaseId: purchaseIdSchema.nullable().default(null),
      vehicleReference: z.string().trim().max(200).nullable().default(null),
      lines: z.array(goodsArrivalLineInputSchema).min(1).max(200),
      note: z.string().trim().max(2_000).nullable().default(null),
      evidenceReferences: evidenceReferencesInputSchema,
    })
    .superRefine((payload, ctx) => {
      const linked = payload.purchaseId !== null;
      payload.lines.forEach((line, index) => {
        if (linked !== (line.purchaseLineId !== null)) {
          ctx.addIssue({
            code: "custom",
            message: "Purchase-linked arrivals require every line to name a Purchase line.",
            path: ["lines", index, "purchaseLineId"],
          });
        }
      });
    }),
);
export type RecordGoodsArrivalCommand = z.infer<typeof recordGoodsArrivalCommandSchema>;
export const reverseGoodsArrivalCommandSchema = defineCommand(
  z.object({
    reversalId: goodsArrivalReversalIdSchema,
    arrivalId: goodsArrivalIdSchema,
    reason: z.string().trim().min(1).max(500),
    evidenceReferences: evidenceReferencesInputSchema,
  }),
);
export type ReverseGoodsArrivalCommand = z.infer<typeof reverseGoodsArrivalCommandSchema>;

export const goodsArrivalReversalDtoSchema = z.object({
  id: goodsArrivalReversalIdSchema,
  reason: z.string(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
  evidenceReferences: evidenceReferencesDtoSchema,
});
export const goodsArrivalDtoSchema = z.object({
  id: goodsArrivalIdSchema,
  workspaceId: workspaceIdSchema,
  supplierId: supplierIdSchema,
  purchaseId: purchaseIdSchema.nullable(),
  vehicleReference: z.string().nullable(),
  lines: z.array(goodsArrivalLineInputSchema),
  note: z.string().nullable(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
  evidenceReferences: evidenceReferencesDtoSchema,
  reversal: goodsArrivalReversalDtoSchema.nullable(),
});
export type GoodsArrivalDto = z.infer<typeof goodsArrivalDtoSchema>;

export const qualityInspectionIssueInputSchema = z.object({
  qualityIssueCodeId: qualityIssueCodeIdSchema,
  qualityIssueCode: z.string().trim().min(1).max(50),
  qualityIssueName: z.string().trim().min(1).max(200),
  severity: qualitySeveritySchema,
  note: z.string().trim().max(1_000).nullable().default(null),
});
export const recordQualityInspectionCommandSchema = defineCommand(
  z.object({
    inspectionId: qualityInspectionIdSchema,
    arrivalLineId: goodsArrivalLineIdSchema,
    inspectedQuantity: quantitySchema,
    issues: z.array(qualityInspectionIssueInputSchema).max(50).default([]),
    note: z.string().trim().max(2_000).nullable().default(null),
    evidenceReferences: evidenceReferencesInputSchema,
  }),
);
export type RecordQualityInspectionCommand = z.infer<typeof recordQualityInspectionCommandSchema>;
export const reverseQualityInspectionCommandSchema = defineCommand(
  z.object({
    reversalId: qualityInspectionReversalIdSchema,
    inspectionId: qualityInspectionIdSchema,
    reason: z.string().trim().min(1).max(500),
  }),
);
export type ReverseQualityInspectionCommand = z.infer<typeof reverseQualityInspectionCommandSchema>;

export const qualityInspectionDtoSchema = z.object({
  id: qualityInspectionIdSchema,
  workspaceId: workspaceIdSchema,
  arrivalLineId: goodsArrivalLineIdSchema,
  inspectedQuantity: quantitySchema,
  issues: z.array(qualityInspectionIssueInputSchema),
  note: z.string().nullable(),
  evidenceReferences: evidenceReferencesDtoSchema,
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  reversal: z
    .object({
      id: qualityInspectionReversalIdSchema,
      reason: z.string(),
      transactionTime: isoInstantSchema,
      recordedAt: isoInstantSchema,
      actorId: actorIdSchema,
      commandId: commandIdSchema,
    })
    .nullable(),
  commandId: commandIdSchema,
});
export type QualityInspectionDto = z.infer<typeof qualityInspectionDtoSchema>;

export const QUALITY_DISPOSITION_OUTCOMES = [
  "accepted",
  "quarantined",
  "rejected",
  "disposed",
] as const;
export const qualityDispositionOutcomeSchema = z.enum(QUALITY_DISPOSITION_OUTCOMES);
export const qualityDispositionSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("arrival_line"), arrivalLineId: goodsArrivalLineIdSchema }),
  z.object({
    type: z.literal("quarantine_allocation"),
    allocationId: qualityDispositionAllocationIdSchema,
  }),
]);
export type QualityDispositionSource = z.infer<typeof qualityDispositionSourceSchema>;

export const qualityDispositionAllocationInputSchema = z
  .object({
    allocationId: qualityDispositionAllocationIdSchema,
    outcome: qualityDispositionOutcomeSchema,
    quantity: quantitySchema,
    qualityGradeId: qualityGradeIdSchema.nullable().default(null),
    qualityGradeName: z.string().trim().min(1).max(100).nullable().default(null),
    note: z.string().trim().max(1_000).nullable().default(null),
  })
  .superRefine((allocation, ctx) => {
    const hasGrade = allocation.qualityGradeId !== null || allocation.qualityGradeName !== null;
    if (allocation.outcome !== "accepted" && hasGrade) {
      ctx.addIssue({
        code: "custom",
        message: "Only accepted quantity may carry a commercial grade.",
      });
    }
    if ((allocation.qualityGradeId === null) !== (allocation.qualityGradeName === null)) {
      ctx.addIssue({ code: "custom", message: "Grade id and name must be supplied together." });
    }
  });
export type QualityDispositionAllocationInput = z.infer<
  typeof qualityDispositionAllocationInputSchema
>;

export const recordQualityDispositionCommandSchema = defineCommand(
  z.object({
    dispositionId: qualityDispositionIdSchema,
    source: qualityDispositionSourceSchema,
    allocations: z.array(qualityDispositionAllocationInputSchema).min(1).max(50),
    note: z.string().trim().max(2_000).nullable().default(null),
    evidenceReferences: evidenceReferencesInputSchema,
  }),
);
export type RecordQualityDispositionCommand = z.infer<typeof recordQualityDispositionCommandSchema>;
export const reverseQualityDispositionCommandSchema = defineCommand(
  z.object({
    reversalId: qualityDispositionReversalIdSchema,
    dispositionId: qualityDispositionIdSchema,
    reason: z.string().trim().min(1).max(500),
    evidenceReferences: evidenceReferencesInputSchema,
  }),
);
export type ReverseQualityDispositionCommand = z.infer<
  typeof reverseQualityDispositionCommandSchema
>;

export const qualityDispositionDtoSchema = z.object({
  id: qualityDispositionIdSchema,
  workspaceId: workspaceIdSchema,
  source: qualityDispositionSourceSchema,
  allocations: z.array(qualityDispositionAllocationInputSchema),
  note: z.string().nullable(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  reversal: z
    .object({
      id: qualityDispositionReversalIdSchema,
      reason: z.string(),
      transactionTime: isoInstantSchema,
      recordedAt: isoInstantSchema,
      actorId: actorIdSchema,
      commandId: commandIdSchema,
      evidenceReferences: evidenceReferencesDtoSchema,
    })
    .nullable(),
  commandId: commandIdSchema,
  evidenceReferences: evidenceReferencesDtoSchema,
});
export type QualityDispositionDto = z.infer<typeof qualityDispositionDtoSchema>;

export const qualityDispositionSourceSummaryDtoSchema = z.object({
  source: qualityDispositionSourceSchema,
  sourceQuantity: quantitySchema,
  allocatedQuantity: quantitySchema,
  remainingQuantity: quantitySchema,
  /** Active inspection coverage for an arrival line; null for quarantine re-processing. */
  inspectedQuantity: quantitySchema.nullable(),
  /** Quantity that may be dispositioned now after inspection and prior allocations. */
  eligibleQuantity: quantitySchema,
  productId: productIdSchema,
  productName: z.string(),
  purchaseId: purchaseIdSchema.nullable(),
  purchaseLineId: purchaseLineIdSchema.nullable(),
  supplierId: supplierIdSchema,
});
export type QualityDispositionSourceSummaryDto = z.infer<
  typeof qualityDispositionSourceSummaryDtoSchema
>;

export const qualityIssueCodeSearchInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  query: z.string().trim().max(200).default(""),
  isActive: z.boolean().nullable().default(true),
});
export const qualityIssueCodeSearchPageSchema = pageOf(qualityIssueCodeDtoSchema);
export const goodsArrivalGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  arrivalId: goodsArrivalIdSchema,
});
export const goodsArrivalListInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  supplierId: supplierIdSchema.nullable().default(null),
  purchaseId: purchaseIdSchema.nullable().default(null),
});
export const goodsArrivalListPageSchema = pageOf(goodsArrivalDtoSchema);
export const qualityInspectionGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  inspectionId: qualityInspectionIdSchema,
});
export const qualityDispositionGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  dispositionId: qualityDispositionIdSchema,
});
export const qualityDispositionSourceSummaryInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  source: qualityDispositionSourceSchema,
});
export const arrivalLineHistoryInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  arrivalLineId: goodsArrivalLineIdSchema,
});
export const arrivalLineHistoryDtoSchema = z.object({
  arrivalLineId: goodsArrivalLineIdSchema,
  inspections: z.array(qualityInspectionDtoSchema),
  dispositions: z.array(qualityDispositionDtoSchema),
});
export type ArrivalLineHistoryDto = z.infer<typeof arrivalLineHistoryDtoSchema>;

export type QualityIssueCodeSearchInput = z.infer<typeof qualityIssueCodeSearchInputSchema>;
export type GoodsArrivalGetInput = z.infer<typeof goodsArrivalGetInputSchema>;
export type GoodsArrivalListInput = z.infer<typeof goodsArrivalListInputSchema>;
export type QualityInspectionGetInput = z.infer<typeof qualityInspectionGetInputSchema>;
export type QualityDispositionGetInput = z.infer<typeof qualityDispositionGetInputSchema>;
export type QualityDispositionSourceSummaryInput = z.infer<
  typeof qualityDispositionSourceSummaryInputSchema
>;
export type ArrivalLineHistoryInput = z.infer<typeof arrivalLineHistoryInputSchema>;
