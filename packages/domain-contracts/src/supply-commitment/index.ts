import { z } from "zod";
import { defineCommand, defineVersionedCommand } from "../shared/command.ts";
import { currencyCodeSchema, moneySchema } from "../shared/money.ts";
import { pageOf, pageRequestSchema } from "../shared/pagination.ts";
import {
  productIdSchema,
  qualityGradeIdSchema,
  supplierIdSchema,
  supplyCommitmentIdSchema,
  supplyCommitmentLineIdSchema,
  workspaceIdSchema,
} from "../shared/ids.ts";
import { quantitySchema } from "../shared/quantity.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { evidenceReferencesDtoSchema, evidenceReferencesInputSchema } from "../shared/evidence.ts";
import { capabilitySchema } from "../shared/capability.ts";

/** A commercial supply promise is not a Purchase and has no payable or stock effect. */
export const SUPPLY_COMMITMENT_STATUSES = ["draft", "confirmed", "cancelled"] as const;
export const supplyCommitmentStatusSchema = z.enum(SUPPLY_COMMITMENT_STATUSES);
export type SupplyCommitmentStatus = z.infer<typeof supplyCommitmentStatusSchema>;

export const supplyCommitmentTermsSnapshotSchema = z
  .object({
    label: z.string().trim().min(1).max(200),
    dueAt: isoInstantSchema.nullable(),
  })
  .nullable()
  .default(null);
export type SupplyCommitmentTermsSnapshot = z.infer<typeof supplyCommitmentTermsSnapshotSchema>;

export const supplyCommitmentLineInputSchema = z.object({
  lineId: supplyCommitmentLineIdSchema,
  productId: productIdSchema.nullable().default(null),
  qualityGradeId: qualityGradeIdSchema.nullable().default(null),
  productName: z.string().trim().min(1).max(200),
  quantity: quantitySchema,
  agreedUnitPrice: moneySchema.nullable().default(null),
});
export type SupplyCommitmentLineInput = z.infer<typeof supplyCommitmentLineInputSchema>;

const supplyCommitmentDraftFields = z.object({
  supplyCommitmentId: supplyCommitmentIdSchema,
  supplierId: supplierIdSchema,
  currency: currencyCodeSchema,
  lines: z.array(supplyCommitmentLineInputSchema).max(200),
  expectedArrivalAt: isoInstantSchema.nullable().default(null),
  paymentTermsSnapshot: supplyCommitmentTermsSnapshotSchema,
  note: z.string().trim().max(2_000).nullable().default(null),
  evidenceReferences: evidenceReferencesInputSchema,
  replacesSupplyCommitmentId: supplyCommitmentIdSchema.nullable().default(null),
});

export const createSupplyCommitmentDraftCommandSchema = defineCommand(supplyCommitmentDraftFields);
export type CreateSupplyCommitmentDraftCommand = z.infer<
  typeof createSupplyCommitmentDraftCommandSchema
>;
export const updateSupplyCommitmentDraftCommandSchema = defineVersionedCommand(
  supplyCommitmentDraftFields,
);
export type UpdateSupplyCommitmentDraftCommand = z.infer<
  typeof updateSupplyCommitmentDraftCommandSchema
>;
export const confirmSupplyCommitmentCommandSchema = defineVersionedCommand(
  z.object({ supplyCommitmentId: supplyCommitmentIdSchema }),
);
export type ConfirmSupplyCommitmentCommand = z.infer<typeof confirmSupplyCommitmentCommandSchema>;
export const cancelSupplyCommitmentCommandSchema = defineVersionedCommand(
  z.object({
    supplyCommitmentId: supplyCommitmentIdSchema,
    reason: z.string().trim().min(1).max(500),
  }),
);
export type CancelSupplyCommitmentCommand = z.infer<typeof cancelSupplyCommitmentCommandSchema>;

export const supplyCommitmentLineDtoSchema = supplyCommitmentLineInputSchema.extend({
  lineTotal: moneySchema.nullable(),
});
export type SupplyCommitmentLineDto = z.infer<typeof supplyCommitmentLineDtoSchema>;
export const supplyCommitmentCapabilitiesSchema = z.object({
  edit: capabilitySchema,
  confirm: capabilitySchema,
  cancel: capabilitySchema,
});
export type SupplyCommitmentCapabilities = z.infer<typeof supplyCommitmentCapabilitiesSchema>;
export const supplyCommitmentDtoSchema = z.object({
  id: supplyCommitmentIdSchema,
  workspaceId: workspaceIdSchema,
  supplierId: supplierIdSchema,
  status: supplyCommitmentStatusSchema,
  currency: currencyCodeSchema,
  lines: z.array(supplyCommitmentLineDtoSchema),
  totalAmount: moneySchema.nullable(),
  expectedArrivalAt: isoInstantSchema.nullable(),
  paymentTermsSnapshot: supplyCommitmentTermsSnapshotSchema,
  note: z.string().nullable(),
  evidenceReferences: evidenceReferencesDtoSchema,
  version: z.int().positive(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  confirmedAt: isoInstantSchema.nullable(),
  cancelledAt: isoInstantSchema.nullable(),
  cancellationReason: z.string().nullable(),
  replacesSupplyCommitmentId: supplyCommitmentIdSchema.nullable(),
  capabilities: supplyCommitmentCapabilitiesSchema,
});
export type SupplyCommitmentDto = z.infer<typeof supplyCommitmentDtoSchema>;
export const supplyCommitmentGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  supplyCommitmentId: supplyCommitmentIdSchema,
});
export type SupplyCommitmentGetInput = z.infer<typeof supplyCommitmentGetInputSchema>;
export const supplyCommitmentListInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  supplierId: supplierIdSchema.nullable().default(null),
  status: supplyCommitmentStatusSchema.nullable().default(null),
});
export type SupplyCommitmentListInput = z.infer<typeof supplyCommitmentListInputSchema>;
export const supplyCommitmentListPageSchema = pageOf(supplyCommitmentDtoSchema);
