import { z } from "zod";
import { defineCommand, defineVersionedCommand } from "../shared/command.ts";
import { moneySchema } from "../shared/money.ts";
import { pageOf, pageRequestSchema } from "../shared/pagination.ts";
import {
  actorIdSchema,
  cashAccountIdSchema,
  commandIdSchema,
  supplierAccountEntryIdSchema,
  supplierIdSchema,
  supplierPaymentIdSchema,
  supplierPaymentReversalIdSchema,
  workspaceIdSchema,
} from "../shared/ids.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { paymentMethodSchema } from "../payment/index.ts";

const supplierFields = z.object({
  supplierId: supplierIdSchema,
  displayName: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(40).nullable().default(null),
  note: z.string().trim().max(2_000).nullable().default(null),
});

export const createSupplierCommandSchema = defineCommand(supplierFields);
export type CreateSupplierCommand = z.infer<typeof createSupplierCommandSchema>;
export const updateSupplierCommandSchema = defineVersionedCommand(supplierFields);
export type UpdateSupplierCommand = z.infer<typeof updateSupplierCommandSchema>;

const supplierLifecyclePayload = z.object({
  supplierId: supplierIdSchema,
  reason: z.string().trim().min(1).max(500),
});
export const deactivateSupplierCommandSchema = defineVersionedCommand(supplierLifecyclePayload);
export type DeactivateSupplierCommand = z.infer<typeof deactivateSupplierCommandSchema>;
export const reactivateSupplierCommandSchema = defineVersionedCommand(supplierLifecyclePayload);
export type ReactivateSupplierCommand = z.infer<typeof reactivateSupplierCommandSchema>;

export const supplierDtoSchema = z.object({
  id: supplierIdSchema,
  workspaceId: workspaceIdSchema,
  displayName: z.string(),
  phone: z.string().nullable(),
  note: z.string().nullable(),
  isActive: z.boolean(),
  version: z.int().positive(),
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
});
export type SupplierDto = z.infer<typeof supplierDtoSchema>;

export const supplierSearchInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  query: z.string().trim().max(200).default(""),
  isActive: z.boolean().nullable().default(true),
});
export type SupplierSearchInput = z.infer<typeof supplierSearchInputSchema>;
export const supplierSearchPageSchema = pageOf(supplierDtoSchema);
export const supplierGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  supplierId: supplierIdSchema,
});

export const SUPPLIER_ACCOUNT_SOURCE_TYPES = [
  "supplier_payment",
  "supplier_payment_reversal",
  "manual_adjustment",
  "purchase_confirmation",
  "purchase_void",
] as const;
export const supplierAccountSourceTypeSchema = z.enum(SUPPLIER_ACCOUNT_SOURCE_TYPES);
export type SupplierAccountSourceType = z.infer<typeof supplierAccountSourceTypeSchema>;

export const supplierBalanceClassificationSchema = z.enum([
  "payable",
  "settled",
  "supplier_credit",
]);
export type SupplierBalanceClassification = z.infer<typeof supplierBalanceClassificationSchema>;

export const recordSupplierPaymentCommandSchema = defineCommand(
  z.object({
    supplierPaymentId: supplierPaymentIdSchema,
    supplierId: supplierIdSchema,
    amount: moneySchema,
    method: paymentMethodSchema,
    cashAccountId: cashAccountIdSchema.nullable().optional(),
    note: z.string().trim().max(2_000).nullable().default(null),
  }),
);
export type RecordSupplierPaymentCommand = z.infer<typeof recordSupplierPaymentCommandSchema>;

export const reverseSupplierPaymentCommandSchema = defineVersionedCommand(
  z.object({
    reversalId: supplierPaymentReversalIdSchema,
    supplierPaymentId: supplierPaymentIdSchema,
    amount: moneySchema,
    cashAccountId: cashAccountIdSchema.nullable().optional(),
    reason: z.string().trim().max(500),
  }),
);
export type ReverseSupplierPaymentCommand = z.infer<typeof reverseSupplierPaymentCommandSchema>;

export const supplierAdjustmentReasonCodeSchema = z.enum([
  "opening_balance",
  "write_off",
  "settlement",
  "manual_adjustment",
]);
export type SupplierAdjustmentReasonCode = z.infer<typeof supplierAdjustmentReasonCodeSchema>;
export const supplierAdjustmentDirectionSchema = z.enum(["increase_payable", "decrease_payable"]);
export const adjustSupplierAccountCommandSchema = defineCommand(
  z.object({
    adjustmentId: z.uuid(),
    supplierId: supplierIdSchema,
    amount: moneySchema,
    direction: supplierAdjustmentDirectionSchema,
    reasonCode: supplierAdjustmentReasonCodeSchema,
    reason: z.string().trim().max(500),
  }),
);
export type AdjustSupplierAccountCommand = z.infer<typeof adjustSupplierAccountCommandSchema>;

export const supplierPaymentDtoSchema = z.object({
  id: supplierPaymentIdSchema,
  workspaceId: workspaceIdSchema,
  supplierId: supplierIdSchema,
  amount: moneySchema,
  method: paymentMethodSchema,
  cashAccountId: cashAccountIdSchema.nullable(),
  note: z.string().nullable(),
  reversedAmount: moneySchema,
  status: z.enum(["recorded", "partially_reversed", "reversed"]),
  version: z.int().positive(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
});
export type SupplierPaymentDto = z.infer<typeof supplierPaymentDtoSchema>;
export const supplierPaymentGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  supplierPaymentId: supplierPaymentIdSchema,
});

export const supplierAccountEntryDtoSchema = z.object({
  id: supplierAccountEntryIdSchema,
  workspaceId: workspaceIdSchema,
  supplierId: supplierIdSchema,
  amount: moneySchema,
  sourceType: supplierAccountSourceTypeSchema,
  sourceId: z.uuid(),
  reversalOfEntryId: supplierAccountEntryIdSchema.nullable(),
  reasonCode: z.string().nullable(),
  reason: z.string().nullable(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
  sourceDocument: z
    .object({
      type: z.enum(["supplier_payment", "purchase", "supplier_adjustment"]),
      id: z.uuid(),
    })
    .optional(),
});
export type SupplierAccountEntryDto = z.infer<typeof supplierAccountEntryDtoSchema>;

export const supplierAccountBalanceDtoSchema = z.object({
  workspaceId: workspaceIdSchema,
  supplierId: supplierIdSchema,
  balance: moneySchema,
  classification: supplierBalanceClassificationSchema,
  entryCount: z.int().nonnegative(),
  lastEntryTransactionTime: isoInstantSchema.nullable(),
  updatedAt: isoInstantSchema,
});
export type SupplierAccountBalanceDto = z.infer<typeof supplierAccountBalanceDtoSchema>;

export const supplierAccountInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  supplierId: supplierIdSchema,
});
export const supplierAdjustmentGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  adjustmentId: z.uuid(),
});
export const supplierAccountTimelineInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  supplierId: supplierIdSchema,
});
export const supplierAccountTimelinePageSchema = pageOf(supplierAccountEntryDtoSchema);

export const supplierReconciliationStatusSchema = z.enum([
  "consistent",
  "inconsistent",
  "not_found",
  "integrity_failure",
]);
export const supplierReconciliationDtoSchema = z.object({
  status: supplierReconciliationStatusSchema,
  supplierId: supplierIdSchema,
  projected: supplierAccountBalanceDtoSchema.nullable(),
  canonical: supplierAccountBalanceDtoSchema.nullable(),
  diagnostics: z.array(z.string()),
});
export type SupplierReconciliationDto = z.infer<typeof supplierReconciliationDtoSchema>;

export const rebuildSupplierAccountCommandSchema = defineCommand(
  z.object({ supplierId: supplierIdSchema }),
);
export type RebuildSupplierAccountCommand = z.infer<typeof rebuildSupplierAccountCommandSchema>;
