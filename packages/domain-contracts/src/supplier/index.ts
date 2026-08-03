import { z } from "zod";
import { defineCommand, defineVersionedCommand } from "../shared/command.ts";
import { moneySchema } from "../shared/money.ts";
import { pageOf, pageRequestSchema } from "../shared/pagination.ts";
import {
  actorIdSchema,
  cashAccountIdSchema,
  commandIdSchema,
  productIdSchema,
  purchaseIdSchema,
  purchaseLineIdSchema,
  supplierAccountEntryIdSchema,
  supplierIdSchema,
  supplierPaymentIdSchema,
  supplierPaymentReversalIdSchema,
  supplierObservationIdSchema,
  workspaceIdSchema,
  workspacePolicyVersionIdSchema,
} from "../shared/ids.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { paymentMethodSchema } from "../payment/index.ts";
import { quantitySchema } from "../shared/quantity.ts";
import { evidenceReferencesDtoSchema, evidenceReferencesInputSchema } from "../shared/evidence.ts";

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

/**
 * Observed prices from confirmed Purchase snapshots. This is deliberately not
 * a suggested, normalized or "best" price: those semantics need supplier
 * catalogue policy and field evidence first.
 */
export const supplierPriceHistoryRowDtoSchema = z.object({
  workspaceId: workspaceIdSchema,
  supplierId: supplierIdSchema,
  purchaseId: purchaseIdSchema,
  purchaseLineId: purchaseLineIdSchema,
  productId: productIdSchema,
  productName: z.string(),
  quantity: quantitySchema,
  unitPrice: moneySchema,
  lineTotal: moneySchema,
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  confirmedAt: isoInstantSchema,
});
export type SupplierPriceHistoryRowDto = z.infer<typeof supplierPriceHistoryRowDtoSchema>;
export const supplierPriceHistoryInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  supplierId: supplierIdSchema,
  productId: productIdSchema.nullable().default(null),
});
export type SupplierPriceHistoryInput = z.infer<typeof supplierPriceHistoryInputSchema>;
export const supplierPriceHistoryPageSchema = pageOf(supplierPriceHistoryRowDtoSchema);

/**
 * Supplier performance is a policy-backed summary of source-linked observations.
 * The first strategy is deliberately descriptive: it reports observed delivery,
 * acceptance and timing facts without ranking suppliers or recommending a buy.
 */
export const SUPPLIER_EVALUATION_STRATEGIES = ["observed_outcomes_summary"] as const;
export const supplierEvaluationStrategySchema = z.enum(SUPPLIER_EVALUATION_STRATEGIES);
export type SupplierEvaluationStrategy = z.infer<typeof supplierEvaluationStrategySchema>;

export const supplierEvaluationPolicyDefinitionSchema = z.object({
  contractVersion: z.literal(1),
  parameters: z.object({
    strategy: supplierEvaluationStrategySchema,
    windowDays: z.int().min(1).max(3_660),
    minimumObservationCount: z.int().positive().max(10_000),
  }),
});
export type SupplierEvaluationPolicyDefinition = z.infer<
  typeof supplierEvaluationPolicyDefinitionSchema
>;

const supplierPerformanceQuantityMetricSchema = z.object({
  unit: quantitySchema.shape.unit,
  promisedQuantity: quantitySchema.nullable(),
  actualQuantity: quantitySchema.nullable(),
  acceptedQuantity: quantitySchema.nullable(),
  rejectedQuantity: quantitySchema.nullable(),
  fulfilmentRateBasisPoints: z.int().min(0).max(10_000).nullable(),
  acceptanceRateBasisPoints: z.int().min(0).max(10_000).nullable(),
});
export type SupplierPerformanceQuantityMetric = z.infer<
  typeof supplierPerformanceQuantityMetricSchema
>;

const supplierPerformanceTimingSchema = z.object({
  measuredCount: z.int().nonnegative(),
  onTimeCount: z.int().nonnegative(),
  lateCount: z.int().nonnegative(),
});
export type SupplierPerformanceTiming = z.infer<typeof supplierPerformanceTimingSchema>;

export const supplierPerformanceInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  supplierId: supplierIdSchema,
  asOf: isoInstantSchema,
});
export type SupplierPerformanceInput = z.infer<typeof supplierPerformanceInputSchema>;

export const supplierPerformanceDtoSchema = z.object({
  workspaceId: workspaceIdSchema,
  supplierId: supplierIdSchema,
  asOf: isoInstantSchema,
  windowStart: isoInstantSchema,
  status: z.enum(["available", "unavailable"]),
  policyVersionId: workspacePolicyVersionIdSchema.nullable(),
  policyVersion: z.int().positive().nullable(),
  strategy: supplierEvaluationStrategySchema.nullable(),
  calculationVersion: z.literal("supplier-performance-v1"),
  diagnostics: z.array(z.string()),
  observationCount: z.int().nonnegative(),
  measurementObservationCount: z.int().nonnegative(),
  sourceObservationIds: z.array(supplierObservationIdSchema),
  quantityMetrics: z.array(supplierPerformanceQuantityMetricSchema),
  timing: supplierPerformanceTimingSchema.nullable(),
});
export type SupplierPerformanceDto = z.infer<typeof supplierPerformanceDtoSchema>;

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
    evidenceReferences: evidenceReferencesInputSchema,
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
    evidenceReferences: evidenceReferencesInputSchema,
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

export const supplierPaymentReversalDtoSchema = z.object({
  id: supplierPaymentReversalIdSchema,
  workspaceId: workspaceIdSchema,
  supplierPaymentId: supplierPaymentIdSchema,
  amount: moneySchema,
  reason: z.string(),
  evidenceReferences: evidenceReferencesDtoSchema,
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
});
export type SupplierPaymentReversalDto = z.infer<typeof supplierPaymentReversalDtoSchema>;

export const supplierPaymentDtoSchema = z.object({
  id: supplierPaymentIdSchema,
  workspaceId: workspaceIdSchema,
  supplierId: supplierIdSchema,
  amount: moneySchema,
  method: paymentMethodSchema,
  cashAccountId: cashAccountIdSchema.nullable(),
  note: z.string().nullable(),
  evidenceReferences: evidenceReferencesDtoSchema,
  reversals: z.array(supplierPaymentReversalDtoSchema),
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
