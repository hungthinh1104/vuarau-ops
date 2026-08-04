import { z } from "zod";
import { defineCommand } from "../shared/command.ts";
import {
  actorIdSchema,
  commandIdSchema,
  customerIdSchema,
  productIdSchema,
  qualityGradeIdSchema,
  workspaceIdSchema,
  workspacePolicyVersionIdSchema,
} from "../shared/ids.ts";
import { evidenceReferencesInputSchema, evidenceReferencesDtoSchema } from "../shared/evidence.ts";
import { reconciliationObservationKindSchema } from "../evidence/index.ts";
import { cashMovementSourceTypeSchema } from "../cash/index.ts";
import { moneySchema } from "../shared/money.ts";
import { pageOf, pageRequestSchema } from "../shared/pagination.ts";
import { quantitySchema, unitSchema } from "../shared/quantity.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { supplierEvaluationPolicyDefinitionSchema } from "../supplier/index.ts";
import {
  costAllocationPolicyDefinitionSchema,
  inventoryValuationPolicyDefinitionSchema,
} from "../valuation/index.ts";
import { managementIntelligencePolicyDefinitionSchema } from "../management/index.ts";

/**
 * Policy capabilities are named contracts, not a generic rule engine. A policy
 * version can be recorded and reviewed before any command consumes it.
 */
export const WORKSPACE_POLICY_KINDS = [
  "receivable_payable_recognition",
  "inventory_valuation",
  "cost_allocation",
  "return_claim_credit",
  "purchase_correction",
  "payment_terms_aging",
  "payment_allocation",
  "credit_limit",
  "stock_planning_reorder",
  "stocktake_variance",
  "supplier_evaluation",
  "operating_cycle_reconciliation",
  "cash_custody_deposit",
  "management_intelligence",
] as const;
export const workspacePolicyKindSchema = z.enum(WORKSPACE_POLICY_KINDS);
export type WorkspacePolicyKind = z.infer<typeof workspacePolicyKindSchema>;

/**
 * The first supported cross-dimension correction strategy. It changes only
 * commercial/payable truth; physical Receipt and inventory facts remain linked
 * to the original Purchase.
 */
export const PURCHASE_CORRECTION_STRATEGIES = ["commercial_replacement_only"] as const;
export const purchaseCorrectionStrategySchema = z.enum(PURCHASE_CORRECTION_STRATEGIES);
export type PurchaseCorrectionStrategy = z.infer<typeof purchaseCorrectionStrategySchema>;
export const purchaseCorrectionPolicyDefinitionSchema = z.object({
  contractVersion: z.literal(1),
  parameters: z.object({
    afterReceiving: purchaseCorrectionStrategySchema,
  }),
});
export type PurchaseCorrectionPolicyDefinition = z.infer<
  typeof purchaseCorrectionPolicyDefinitionSchema
>;

export const PAYMENT_ALLOCATION_STRATEGIES = [
  "unallocated",
  "manual",
  "oldest_due_first",
  "oldest_transaction_first",
  "specific_sale",
] as const;
export const paymentAllocationStrategySchema = z.enum(PAYMENT_ALLOCATION_STRATEGIES);
export type PaymentAllocationStrategy = z.infer<typeof paymentAllocationStrategySchema>;

export const CREDIT_CONTROL_MODES = [
  "information_only",
  "warning",
  "approval_required",
  "hard_block",
] as const;
export const creditControlModeSchema = z.enum(CREDIT_CONTROL_MODES);
export type CreditControlMode = z.infer<typeof creditControlModeSchema>;

/** How a Sale's payment term was established, kept with the historical Sale. */
export const PAYMENT_TERM_SOURCES = [
  "sale_override",
  "customer_policy",
  "workspace_policy",
  "none",
] as const;
export const paymentTermSourceSchema = z.enum(PAYMENT_TERM_SOURCES);
export type PaymentTermSource = z.infer<typeof paymentTermSourceSchema>;

const paymentTermOverrideSchema = z.object({
  customerId: customerIdSchema,
  label: z.string().trim().min(1).max(100),
  termDays: z.int().nonnegative(),
});
export type PaymentTermOverride = z.infer<typeof paymentTermOverrideSchema>;

const agingBucketDefinitionSchema = z.object({
  code: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(100),
  minDaysOverdue: z.int().positive(),
  maxDaysOverdue: z.int().nonnegative().nullable(),
});
export type AgingBucketDefinition = z.infer<typeof agingBucketDefinitionSchema>;

export const paymentTermsAgingPolicyDefinitionSchema = z.object({
  contractVersion: z.literal(1),
  parameters: z
    .object({
      defaultTermDays: z.int().nonnegative().nullable(),
      defaultTermLabel: z.string().trim().min(1).max(100),
      customerTerms: z.array(paymentTermOverrideSchema).max(10_000),
      graceDays: z.int().nonnegative(),
      agingBuckets: z.array(agingBucketDefinitionSchema).min(1).max(20),
      // Credit enforcement has its own policy and command boundary. Keeping a
      // second executable mode here would create an undocumented precedence
      // rule, so this field is retained only as an informational compatibility
      // marker until the policy is versioned away.
      creditControl: z.literal("information_only"),
    })
    .superRefine((parameters, context) => {
      const customerIds = new Set<string>();
      for (const [index, term] of parameters.customerTerms.entries()) {
        if (customerIds.has(term.customerId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["customerTerms", index, "customerId"],
            message: "A customer may have only one payment-term override.",
          });
        }
        customerIds.add(term.customerId);
      }

      const buckets = [...parameters.agingBuckets].sort(
        (left, right) => left.minDaysOverdue - right.minDaysOverdue,
      );
      if (buckets[0]?.minDaysOverdue !== 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["agingBuckets"],
          message: "Aging buckets must start at one and cover every overdue day.",
        });
      }
      const bucketCodes = new Set<string>();
      let openEndedIndex = -1;
      for (const [index, bucket] of buckets.entries()) {
        if (bucketCodes.has(bucket.code)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["agingBuckets"],
            message: "Aging bucket codes must be unique.",
          });
        }
        bucketCodes.add(bucket.code);
        if (bucket.maxDaysOverdue !== null && bucket.minDaysOverdue > bucket.maxDaysOverdue) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["agingBuckets"],
            message: "An aging bucket minimum cannot exceed its maximum.",
          });
        }
        if (bucket.maxDaysOverdue === null) {
          if (openEndedIndex !== -1 || index !== buckets.length - 1) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["agingBuckets"],
              message: "Only the final aging bucket may be open-ended.",
            });
          }
          openEndedIndex = index;
        }
        const previous = buckets[index - 1];
        if (
          previous !== undefined &&
          previous.maxDaysOverdue !== null &&
          bucket.minDaysOverdue !== previous.maxDaysOverdue + 1
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["agingBuckets"],
            message: "Aging buckets must not overlap or leave an undefined gap.",
          });
        }
      }
    }),
});
export type PaymentTermsAgingPolicyDefinition = z.infer<
  typeof paymentTermsAgingPolicyDefinitionSchema
>;

export const paymentAllocationPolicyDefinitionSchema = z.object({
  contractVersion: z.literal(1),
  parameters: z.object({
    strategy: paymentAllocationStrategySchema,
  }),
});
export type PaymentAllocationPolicyDefinition = z.infer<
  typeof paymentAllocationPolicyDefinitionSchema
>;

export const creditLimitPolicyDefinitionSchema = z.object({
  contractVersion: z.literal(1),
  parameters: z
    .object({
      mode: creditControlModeSchema,
      limit: moneySchema.nullable(),
    })
    .superRefine((parameters, context) => {
      if (parameters.limit !== null && parameters.limit.amountMinor < 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["limit", "amountMinor"],
          message: "A credit limit cannot be negative.",
        });
      }
      if (parameters.mode === "hard_block" && parameters.limit === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["limit"],
          message: "A hard-block credit policy requires an explicit limit.",
        });
      }
    }),
});
export type CreditLimitPolicyDefinition = z.infer<typeof creditLimitPolicyDefinitionSchema>;

export const STOCK_PLANNING_STRATEGIES = ["fixed_threshold"] as const;
export const stockPlanningStrategySchema = z.enum(STOCK_PLANNING_STRATEGIES);
export type StockPlanningStrategy = z.infer<typeof stockPlanningStrategySchema>;

const stockPlanningRuleSchema = z
  .object({
    productId: productIdSchema,
    qualityGradeId: qualityGradeIdSchema.nullable(),
    unit: unitSchema,
    minimumQuantity: quantitySchema,
    targetQuantity: quantitySchema,
  })
  .superRefine((rule, context) => {
    if (rule.minimumQuantity.unit !== rule.unit || rule.targetQuantity.unit !== rule.unit) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unit"],
        message: "Planning quantities must use the rule unit.",
      });
    }
    if (
      rule.minimumQuantity.valueScaled < 0 ||
      rule.targetQuantity.valueScaled < rule.minimumQuantity.valueScaled
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetQuantity"],
        message: "Target quantity must be at least the non-negative minimum quantity.",
      });
    }
  });
export type StockPlanningRule = z.infer<typeof stockPlanningRuleSchema>;

export const stockPlanningPolicyDefinitionSchema = z.object({
  contractVersion: z.literal(1),
  parameters: z.object({
    strategy: stockPlanningStrategySchema,
    rules: z.array(stockPlanningRuleSchema).min(1).max(10_000),
  }),
});
export type StockPlanningPolicyDefinition = z.infer<typeof stockPlanningPolicyDefinitionSchema>;

export const STOCKTAKE_VARIANCE_STRATEGIES = ["absolute_count"] as const;
export const stocktakeVarianceStrategySchema = z.enum(STOCKTAKE_VARIANCE_STRATEGIES);
export type StocktakeVarianceStrategy = z.infer<typeof stocktakeVarianceStrategySchema>;
export const stocktakeVariancePolicyDefinitionSchema = z.object({
  contractVersion: z.literal(1),
  parameters: z.object({
    strategy: stocktakeVarianceStrategySchema,
    allowReopen: z.boolean(),
  }),
});
export type StocktakeVariancePolicyDefinition = z.infer<
  typeof stocktakeVariancePolicyDefinitionSchema
>;

export const OPERATIONAL_CLOSE_STRATEGIES = ["observation_signoff"] as const;
export const operationalCloseStrategySchema = z.enum(OPERATIONAL_CLOSE_STRATEGIES);
export type OperationalCloseStrategy = z.infer<typeof operationalCloseStrategySchema>;
export const operationalClosePolicyDefinitionSchema = z.object({
  contractVersion: z.literal(1),
  parameters: z.object({
    strategy: operationalCloseStrategySchema,
    requiredObservationKinds: z
      .array(reconciliationObservationKindSchema)
      .min(1)
      .max(9)
      .refine((kinds) => new Set(kinds).size === kinds.length, {
        message: "Required close observation kinds must be unique.",
      }),
    allowReopen: z.boolean(),
  }),
});
export type OperationalClosePolicyDefinition = z.infer<
  typeof operationalClosePolicyDefinitionSchema
>;

export const CASH_CUSTODY_DEPOSIT_STRATEGIES = ["exact_cash_movement"] as const;
export const cashCustodyDepositStrategySchema = z.enum(CASH_CUSTODY_DEPOSIT_STRATEGIES);
export type CashCustodyDepositStrategy = z.infer<typeof cashCustodyDepositStrategySchema>;
export const cashCustodyDepositPolicyDefinitionSchema = z.object({
  contractVersion: z.literal(1),
  parameters: z.object({
    strategy: cashCustodyDepositStrategySchema,
    allowedSourceTypes: z
      .array(cashMovementSourceTypeSchema)
      .min(1)
      .refine((types) => new Set(types).size === types.length, {
        message: "Allowed cash movement source types must be unique.",
      }),
    allowReverse: z.boolean(),
  }),
});
export type CashCustodyDepositPolicyDefinition = z.infer<
  typeof cashCustodyDepositPolicyDefinitionSchema
>;

export { supplierEvaluationPolicyDefinitionSchema };
export type { SupplierEvaluationPolicyDefinition } from "../supplier/index.ts";

export const WORKSPACE_POLICY_STATES = ["draft", "approved", "retired"] as const;
export const workspacePolicyStateSchema = z.enum(WORKSPACE_POLICY_STATES);
export type WorkspacePolicyState = z.infer<typeof workspacePolicyStateSchema>;

/**
 * One registry owns the relationship between a policy capability and its
 * executable definition. `null` is deliberate: the capability is named in the
 * product vocabulary but has no contract and therefore cannot be stored or run.
 */
export const policyDefinitionSchemas = {
  receivable_payable_recognition: null,
  inventory_valuation: inventoryValuationPolicyDefinitionSchema,
  cost_allocation: costAllocationPolicyDefinitionSchema,
  return_claim_credit: null,
  purchase_correction: purchaseCorrectionPolicyDefinitionSchema,
  payment_terms_aging: paymentTermsAgingPolicyDefinitionSchema,
  payment_allocation: paymentAllocationPolicyDefinitionSchema,
  credit_limit: creditLimitPolicyDefinitionSchema,
  stock_planning_reorder: stockPlanningPolicyDefinitionSchema,
  stocktake_variance: stocktakeVariancePolicyDefinitionSchema,
  supplier_evaluation: supplierEvaluationPolicyDefinitionSchema,
  operating_cycle_reconciliation: operationalClosePolicyDefinitionSchema,
  cash_custody_deposit: cashCustodyDepositPolicyDefinitionSchema,
  management_intelligence: managementIntelligencePolicyDefinitionSchema,
} satisfies Record<WorkspacePolicyKind, z.ZodTypeAny | null>;

export type SupportedWorkspacePolicyKind = {
  [K in WorkspacePolicyKind]: (typeof policyDefinitionSchemas)[K] extends z.ZodTypeAny ? K : never;
}[WorkspacePolicyKind];

type SupportedPolicyDefinitionSchema<K extends SupportedWorkspacePolicyKind> = Exclude<
  (typeof policyDefinitionSchemas)[K],
  null
>;
export type WorkspacePolicyDefinition = {
  [K in SupportedWorkspacePolicyKind]: z.infer<SupportedPolicyDefinitionSchema<K>>;
}[SupportedWorkspacePolicyKind];

type SupportedPolicyRegistryEntry = {
  [K in SupportedWorkspacePolicyKind]: [K, SupportedPolicyDefinitionSchema<K>];
}[SupportedWorkspacePolicyKind];

const supportedPolicyRegistryEntries = Object.entries(policyDefinitionSchemas).filter(
  (entry): entry is SupportedPolicyRegistryEntry => entry[1] !== null,
);

/** Runtime options derived from the same registry used by every policy schema. */
export const SUPPORTED_WORKSPACE_POLICY_KINDS = supportedPolicyRegistryEntries.map(
  ([policyKind]) => policyKind,
) as readonly SupportedWorkspacePolicyKind[];

export function validatePolicyDefinition(policyKind: WorkspacePolicyKind, definition: unknown) {
  const schema = policyDefinitionSchemas[policyKind];
  return schema === null ? { success: false as const, error: null } : schema.safeParse(definition);
}

const workspacePolicyDtoBaseSchema = z.object({
  id: workspacePolicyVersionIdSchema,
  workspaceId: workspaceIdSchema,
  version: z.int().positive(),
  state: workspacePolicyStateSchema,
  effectiveFrom: isoInstantSchema,
  effectiveTo: isoInstantSchema.nullable(),
  evidenceReferences: evidenceReferencesDtoSchema,
  createdBy: actorIdSchema,
  createdAt: isoInstantSchema,
  approvedBy: actorIdSchema.nullable(),
  approvedAt: isoInstantSchema.nullable(),
  retiredBy: actorIdSchema.nullable(),
  retiredAt: isoInstantSchema.nullable(),
  commandId: commandIdSchema,
  reason: z.string().nullable(),
});

type PolicyVariantSchema = z.core.$ZodTypeDiscriminable<"policyKind">;

function createPolicyVariantSchemas(
  baseSchema: z.ZodObject,
): [PolicyVariantSchema, ...PolicyVariantSchema[]] {
  const variants = SUPPORTED_WORKSPACE_POLICY_KINDS.map((policyKind) => {
    const definitionSchema = policyDefinitionSchemas[policyKind];
    if (definitionSchema === null) {
      throw new Error(`Missing policy definition contract for ${policyKind}.`);
    }
    return baseSchema.extend({
      policyKind: z.literal(policyKind),
      definition: definitionSchema,
    });
  });
  return variants as unknown as [PolicyVariantSchema, ...PolicyVariantSchema[]];
}

type WorkspacePolicyDtoVariant<K extends SupportedWorkspacePolicyKind> = z.infer<
  typeof workspacePolicyDtoBaseSchema
> & {
  policyKind: K;
  definition: z.infer<SupportedPolicyDefinitionSchema<K>>;
};
export type WorkspacePolicyDto = {
  [K in SupportedWorkspacePolicyKind]: WorkspacePolicyDtoVariant<K>;
}[SupportedWorkspacePolicyKind];

export const workspacePolicyDtoSchema = z.discriminatedUnion(
  "policyKind",
  createPolicyVariantSchemas(workspacePolicyDtoBaseSchema),
) as unknown as z.ZodType<WorkspacePolicyDto>;

/** Parses a persisted DTO and re-runs the registry validator at the adapter boundary. */
export function parseWorkspacePolicyDto(input: unknown): WorkspacePolicyDto {
  const policy = workspacePolicyDtoSchema.parse(input);
  if (!validatePolicyDefinition(policy.policyKind, policy.definition).success) {
    throw new Error(`Invalid policy definition for ${policy.policyKind}.`);
  }
  return policy;
}

const policyVersionFieldsBaseSchema = z.object({
  policyVersionId: workspacePolicyVersionIdSchema,
  version: z.int().positive(),
  effectiveFrom: isoInstantSchema,
  effectiveTo: isoInstantSchema.nullable().default(null),
  evidenceReferences: evidenceReferencesInputSchema,
  reason: z.string().trim().max(500).nullable().default(null),
});

type WorkspacePolicyVersionFieldsVariant<K extends SupportedWorkspacePolicyKind> = z.infer<
  typeof policyVersionFieldsBaseSchema
> & {
  policyKind: K;
  definition: z.infer<SupportedPolicyDefinitionSchema<K>>;
};
export type SupportedWorkspacePolicyVersionFields = {
  [K in SupportedWorkspacePolicyKind]: WorkspacePolicyVersionFieldsVariant<K>;
}[SupportedWorkspacePolicyKind];

export const supportedWorkspacePolicyVersionFieldsSchema = z.discriminatedUnion(
  "policyKind",
  createPolicyVariantSchemas(policyVersionFieldsBaseSchema),
) as unknown as z.ZodType<SupportedWorkspacePolicyVersionFields>;

export const createWorkspacePolicyDraftCommandSchema = defineCommand(
  supportedWorkspacePolicyVersionFieldsSchema,
);
export type CreateWorkspacePolicyDraftCommand = z.infer<
  typeof createWorkspacePolicyDraftCommandSchema
>;

export const approveWorkspacePolicyPayloadSchema = z.object({
  policyVersionId: workspacePolicyVersionIdSchema,
  evidenceReferences: evidenceReferencesInputSchema.refine((refs) => refs.length > 0, {
    message: "Approval requires at least one supporting evidence reference.",
  }),
  reason: z.string().trim().min(1).max(500),
});
export const approveWorkspacePolicyCommandSchema = defineCommand(
  approveWorkspacePolicyPayloadSchema,
);
export type ApproveWorkspacePolicyCommand = z.infer<typeof approveWorkspacePolicyCommandSchema>;

export const retireWorkspacePolicyPayloadSchema = z.object({
  policyVersionId: workspacePolicyVersionIdSchema,
  effectiveTo: isoInstantSchema.nullable().default(null),
  reason: z.string().trim().min(1).max(500),
});
export const retireWorkspacePolicyCommandSchema = defineCommand(retireWorkspacePolicyPayloadSchema);
export type RetireWorkspacePolicyCommand = z.infer<typeof retireWorkspacePolicyCommandSchema>;

export const workspacePolicyGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  policyVersionId: workspacePolicyVersionIdSchema,
});
export type WorkspacePolicyGetInput = z.infer<typeof workspacePolicyGetInputSchema>;

export const workspacePolicyListInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  policyKind: workspacePolicyKindSchema.nullable().default(null),
  state: workspacePolicyStateSchema.nullable().default(null),
});
export type WorkspacePolicyListInput = z.infer<typeof workspacePolicyListInputSchema>;
export const workspacePolicyPageSchema = pageOf(workspacePolicyDtoSchema);

/** `unavailable` is not equivalent to zero, false, or a guessed default. */
export const workspacePolicyAvailabilitySchema = z.object({
  policyKind: workspacePolicyKindSchema,
  availability: z.enum(["unavailable", "available"]),
  reason: z.enum([
    "unsupported_definition_contract",
    "no_approved_version",
    "effective_window_not_started",
    "effective_window_closed",
    "corrupt_definition",
    "corrupt_overlap",
    "approved",
  ]),
  policyVersionId: workspacePolicyVersionIdSchema.nullable(),
  version: z.int().positive().nullable(),
});
export type WorkspacePolicyAvailability = z.infer<typeof workspacePolicyAvailabilitySchema>;

export const workspacePolicyAvailabilityListSchema = z.array(workspacePolicyAvailabilitySchema);
export const workspacePolicyAvailabilityInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  asOf: isoInstantSchema,
});
export type WorkspacePolicyAvailabilityInput = z.infer<
  typeof workspacePolicyAvailabilityInputSchema
>;
