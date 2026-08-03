import { z } from "zod";
import { defineCommand, defineVersionedCommand } from "../shared/command.ts";
import {
  actorIdSchema,
  deliveryIdSchema,
  deliveryLineIdSchema,
  deliveryReturnIdSchema,
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
export const deliveryGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  deliveryId: deliveryIdSchema,
});
export type DeliveryGetInput = z.infer<typeof deliveryGetInputSchema>;
export const deliveryListInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  saleId: saleIdSchema.nullable().default(null),
  status: deliveryStatusSchema.nullable().default(null),
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
