import { z } from "zod";
import { defineCommand, defineVersionedCommand } from "../shared/command.ts";
import {
  actorIdSchema,
  commandIdSchema,
  deliveryIdSchema,
  deliveryLineIdSchema,
  deliveryReturnIdSchema,
  deliveryReturnSettlementIdSchema,
  fulfilmentRemainderCaseIdSchema,
  productIdSchema,
  qualityGradeIdSchema,
  saleIdSchema,
  saleLineIdSchema,
  workspaceIdSchema,
} from "../shared/ids.ts";
import { pageOf, pageRequestSchema } from "../shared/pagination.ts";
import { quantitySchema } from "../shared/quantity.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { capabilitySchema } from "../shared/capability.ts";
import { evidenceReferencesDtoSchema, evidenceReferencesInputSchema } from "../shared/evidence.ts";

export const DELIVERY_STATUSES = ["draft", "cancelled", "dispatched", "delivered"] as const;
export const deliveryStatusSchema = z.enum(DELIVERY_STATUSES);
export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;

export const deliveryLineInputSchema = z.object({
  deliveryLineId: deliveryLineIdSchema,
  saleLineId: saleLineIdSchema,
  productId: productIdSchema,
  qualityGradeId: qualityGradeIdSchema.nullable().default(null),
  quantity: quantitySchema,
});
export type DeliveryLineInput = z.infer<typeof deliveryLineInputSchema>;

export const createDeliveryDraftCommandSchema = defineCommand(
  z.object({
    deliveryId: deliveryIdSchema,
    saleId: saleIdSchema,
    lines: z.array(deliveryLineInputSchema).min(1).max(100),
    note: z.string().trim().max(2_000).nullable().default(null),
    evidenceReferences: evidenceReferencesInputSchema,
  }),
);
export type CreateDeliveryDraftCommand = z.infer<typeof createDeliveryDraftCommandSchema>;
export const updateDeliveryDraftCommandSchema = defineVersionedCommand(
  z.object({
    deliveryId: deliveryIdSchema,
    lines: z.array(deliveryLineInputSchema).min(1).max(100),
    note: z.string().trim().max(2_000).nullable().default(null),
    evidenceReferences: evidenceReferencesInputSchema,
  }),
);
export type UpdateDeliveryDraftCommand = z.infer<typeof updateDeliveryDraftCommandSchema>;
export const cancelDeliveryDraftCommandSchema = defineVersionedCommand(
  z.object({
    deliveryId: deliveryIdSchema,
    reason: z.string().trim().max(500),
  }),
);
export type CancelDeliveryDraftCommand = z.infer<typeof cancelDeliveryDraftCommandSchema>;
const deliveryLifecyclePayloadSchema = z.object({ deliveryId: deliveryIdSchema });
export const dispatchDeliveryCommandSchema = defineVersionedCommand(deliveryLifecyclePayloadSchema);
export type DispatchDeliveryCommand = z.infer<typeof dispatchDeliveryCommandSchema>;
export const markDeliveryDeliveredCommandSchema = defineVersionedCommand(
  deliveryLifecyclePayloadSchema,
);
export type MarkDeliveryDeliveredCommand = z.infer<typeof markDeliveryDeliveredCommandSchema>;
export const recordDeliveryReturnCommandSchema = defineCommand(
  z.object({
    returnId: deliveryReturnIdSchema,
    deliveryId: deliveryIdSchema,
    lines: z
      .array(
        z.object({
          deliveryLineId: deliveryLineIdSchema,
          quantity: quantitySchema,
        }),
      )
      .min(1)
      .max(100),
    reason: z.string().trim().max(500),
    evidenceReferences: evidenceReferencesInputSchema,
  }),
);
export type RecordDeliveryReturnCommand = z.infer<typeof recordDeliveryReturnCommandSchema>;

/**
 * The only currently approved partial-return settlement is an explicit
 * acknowledgement that the depot received goods back without changing money.
 * Refund, credit and replacement remain policy-blocked until ASM-037 closes.
 */
export const RETURN_SETTLEMENT_OUTCOMES = ["goods_only"] as const;
export const returnSettlementOutcomeSchema = z.enum(RETURN_SETTLEMENT_OUTCOMES);
export type ReturnSettlementOutcome = z.infer<typeof returnSettlementOutcomeSchema>;
export const RETURN_SETTLEMENT_CASE_KINDS = ["decision", "correction"] as const;
export const returnSettlementCaseKindSchema = z.enum(RETURN_SETTLEMENT_CASE_KINDS);
export type ReturnSettlementCaseKind = z.infer<typeof returnSettlementCaseKindSchema>;
export const recordDeliveryReturnSettlementCommandSchema = defineCommand(
  z.object({
    settlementId: deliveryReturnSettlementIdSchema,
    returnId: deliveryReturnIdSchema,
    caseKind: returnSettlementCaseKindSchema,
    outcome: returnSettlementOutcomeSchema,
    reason: z.string().trim().min(1).max(500),
    relatedSettlementId: deliveryReturnSettlementIdSchema.nullable().default(null),
    evidenceReferences: evidenceReferencesInputSchema,
  }),
);
export type RecordDeliveryReturnSettlementCommand = z.infer<
  typeof recordDeliveryReturnSettlementCommandSchema
>;

export const deliveryReturnSettlementDtoSchema = z.object({
  id: deliveryReturnSettlementIdSchema,
  workspaceId: workspaceIdSchema,
  returnId: deliveryReturnIdSchema,
  caseKind: returnSettlementCaseKindSchema,
  outcome: returnSettlementOutcomeSchema,
  reason: z.string(),
  relatedSettlementId: deliveryReturnSettlementIdSchema.nullable(),
  evidenceReferences: evidenceReferencesDtoSchema,
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
});
export type DeliveryReturnSettlementDto = z.infer<typeof deliveryReturnSettlementDtoSchema>;

/**
 * An explicit operator fact for a positive fulfilment remainder. The ordinary
 * physical states `needs_delivery` and `in_delivery` do not create this case.
 * Decisions are fact-only in this slice; they do not mutate inventory, money or
 * the Sale itself.
 */
export const FULFILMENT_REMAINDER_OUTCOMES = [
  "continue_fulfilment",
  "commercial_correction",
  "cancel_remainder",
] as const;
export const fulfilmentRemainderOutcomeSchema = z.enum(FULFILMENT_REMAINDER_OUTCOMES);
export type FulfilmentRemainderOutcome = z.infer<typeof fulfilmentRemainderOutcomeSchema>;
export const FULFILMENT_REMAINDER_CASE_KINDS = ["opened", "decision", "correction"] as const;
export const fulfilmentRemainderCaseKindSchema = z.enum(FULFILMENT_REMAINDER_CASE_KINDS);
export type FulfilmentRemainderCaseKind = z.infer<typeof fulfilmentRemainderCaseKindSchema>;
export const recordFulfilmentRemainderCaseCommandSchema = defineCommand(
  z.object({
    fulfilmentRemainderCaseId: fulfilmentRemainderCaseIdSchema,
    saleId: saleIdSchema,
    caseKind: fulfilmentRemainderCaseKindSchema,
    outcome: fulfilmentRemainderOutcomeSchema.nullable().default(null),
    reason: z.string().trim().min(1).max(500),
    relatedCaseId: fulfilmentRemainderCaseIdSchema.nullable().default(null),
    evidenceReferences: evidenceReferencesInputSchema,
  }),
);
export type RecordFulfilmentRemainderCaseCommand = z.infer<
  typeof recordFulfilmentRemainderCaseCommandSchema
>;
export const fulfilmentRemainderCaseDtoSchema = z.object({
  id: fulfilmentRemainderCaseIdSchema,
  workspaceId: workspaceIdSchema,
  saleId: saleIdSchema,
  caseKind: fulfilmentRemainderCaseKindSchema,
  outcome: fulfilmentRemainderOutcomeSchema.nullable(),
  reason: z.string(),
  relatedCaseId: fulfilmentRemainderCaseIdSchema.nullable(),
  evidenceReferences: evidenceReferencesDtoSchema,
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
});
export type FulfilmentRemainderCaseDto = z.infer<typeof fulfilmentRemainderCaseDtoSchema>;

export const deliveryReturnDtoSchema = z.object({
  id: deliveryReturnIdSchema,
  reason: z.string(),
  evidenceReferences: evidenceReferencesDtoSchema,
  lines: z.array(
    z.object({
      deliveryLineId: deliveryLineIdSchema,
      quantity: quantitySchema,
    }),
  ),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
});
export const deliveryDtoSchema = z.object({
  id: deliveryIdSchema,
  workspaceId: workspaceIdSchema,
  saleId: saleIdSchema,
  status: deliveryStatusSchema,
  lines: z.array(
    z.object({
      deliveryLineId: deliveryLineIdSchema,
      saleLineId: saleLineIdSchema,
      productId: productIdSchema,
      productName: z.string(),
      qualityGradeId: qualityGradeIdSchema.nullable(),
      qualityGradeName: z.string().nullable(),
      quantity: quantitySchema,
      returnedQuantity: quantitySchema,
    }),
  ),
  note: z.string().nullable(),
  evidenceReferences: evidenceReferencesDtoSchema,
  cancellationReason: z.string().nullable(),
  version: z.int().positive(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  dispatchedAt: isoInstantSchema.nullable(),
  deliveredAt: isoInstantSchema.nullable(),
  returns: z.array(deliveryReturnDtoSchema),
});
export type DeliveryDto = z.infer<typeof deliveryDtoSchema>;
export const deliverySummaryDtoSchema = deliveryDtoSchema.extend({
  displayReference: z.string(),
  saleDisplayReference: z.string(),
  customerDisplayName: z.string().nullable(),
  primaryProductName: z.string().nullable(),
  lineCount: z.int().nonnegative(),
});
export type DeliverySummaryDto = z.infer<typeof deliverySummaryDtoSchema>;
export const deliveryGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  deliveryId: deliveryIdSchema,
});
export type DeliveryGetInput = z.infer<typeof deliveryGetInputSchema>;
export const deliveryListInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  saleId: saleIdSchema.nullable().default(null),
  status: deliveryStatusSchema.nullable().default(null),
  query: z.string().trim().max(200).default(""),
});
export type DeliveryListInput = z.infer<typeof deliveryListInputSchema>;
export const saleFulfilmentInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  saleId: saleIdSchema,
});
export type SaleFulfilmentInput = z.infer<typeof saleFulfilmentInputSchema>;
export const saleFulfilmentDtoSchema = z.object({
  saleId: saleIdSchema,
  integrity: z.enum(["healthy", "attention"]),
  capabilities: z.object({
    createDelivery: capabilitySchema,
  }),
  lines: z.array(
    z.object({
      saleLineId: saleLineIdSchema,
      productId: productIdSchema.nullable(),
      productName: z.string(),
      qualityGradeId: qualityGradeIdSchema.nullable(),
      qualityGradeName: z.string().nullable(),
      ordered: quantitySchema,
      dispatched: quantitySchema,
      returned: quantitySchema,
      netFulfilled: quantitySchema,
      remaining: quantitySchema,
      fulfilmentState: z.enum([
        "unfulfilled",
        "partially_fulfilled",
        "fulfilled",
        "returned_partial",
        "attention",
      ]),
      blockedReason: z.string().nullable(),
    }),
  ),
});
export type SaleFulfilmentDto = z.infer<typeof saleFulfilmentDtoSchema>;
export const deliveryPageSchema = pageOf(deliveryDtoSchema);
