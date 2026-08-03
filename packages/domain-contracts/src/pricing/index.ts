import { z } from "zod";
import { defineCommand } from "../shared/command.ts";
import { moneySchema } from "../shared/money.ts";
import {
  actorIdSchema,
  commandIdSchema,
  customerIdSchema,
  priceRuleIdSchema,
  productIdSchema,
  qualityGradeIdSchema,
  workspaceIdSchema,
} from "../shared/ids.ts";
import { pageOf, pageRequestSchema } from "../shared/pagination.ts";
import { unitSchema } from "../shared/quantity.ts";
import { isoInstantSchema } from "../shared/time.ts";

export const PRICE_RULE_KINDS = ["list", "customer", "override"] as const;
export const priceRuleKindSchema = z.enum(PRICE_RULE_KINDS);
export type PriceRuleKind = z.infer<typeof priceRuleKindSchema>;

const priceRuleFieldsSchema = z.object({
  priceRuleId: priceRuleIdSchema,
  productId: productIdSchema,
  qualityGradeId: qualityGradeIdSchema.nullable().default(null),
  customerId: customerIdSchema.nullable().default(null),
  unit: unitSchema,
  kind: priceRuleKindSchema,
  /** Explicit precedence. Equal precedence is reported as ambiguous, never guessed. */
  priority: z.int().nonnegative().max(1_000_000).default(0),
  /** Threshold in the same unit as `unit`; no unit conversion is performed. */
  minimumQuantityScaled: z.int().nonnegative().default(0),
  effectiveFrom: isoInstantSchema,
  effectiveTo: isoInstantSchema.nullable().default(null),
  baseUnitPrice: moneySchema,
  discountPerUnit: moneySchema,
  feePerUnit: moneySchema,
  reason: z.string().trim().max(500).nullable().default(null),
});

/**
 * A price rule is an append-only commercial fact. A later rule supersedes it by
 * effective time; neither a posted Sale nor an old price rule is rewritten.
 * `finalUnitPrice` is calculated by the kernel from the three money fields.
 */
export const recordPriceRuleCommandSchema = defineCommand(priceRuleFieldsSchema);
export type RecordPriceRuleCommand = z.infer<typeof recordPriceRuleCommandSchema>;

export const priceRuleDtoSchema = z.object({
  id: priceRuleIdSchema,
  workspaceId: workspaceIdSchema,
  productId: productIdSchema,
  qualityGradeId: qualityGradeIdSchema.nullable(),
  customerId: customerIdSchema.nullable(),
  unit: unitSchema,
  kind: priceRuleKindSchema,
  priority: z.int().nonnegative(),
  minimumQuantityScaled: z.int().nonnegative(),
  effectiveFrom: isoInstantSchema,
  effectiveTo: isoInstantSchema.nullable(),
  baseUnitPrice: moneySchema,
  discountPerUnit: moneySchema,
  feePerUnit: moneySchema,
  finalUnitPrice: moneySchema,
  reason: z.string().nullable(),
  actorId: actorIdSchema,
  commandId: commandIdSchema,
  recordedAt: isoInstantSchema,
});
export type PriceRuleDto = z.infer<typeof priceRuleDtoSchema>;

export const priceRuleListInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  productId: productIdSchema.nullable().default(null),
  qualityGradeId: qualityGradeIdSchema.nullable().default(null),
  customerId: customerIdSchema.nullable().default(null),
  unit: unitSchema.nullable().default(null),
});
export type PriceRuleListInput = z.infer<typeof priceRuleListInputSchema>;
export const priceRulePageSchema = pageOf(priceRuleDtoSchema);

export const resolvePriceInputSchema = z
  .object({
    workspaceId: workspaceIdSchema,
    productId: productIdSchema,
    qualityGradeId: qualityGradeIdSchema.nullable().default(null),
    customerId: customerIdSchema.nullable().default(null),
    unit: unitSchema,
    quantity: z.object({ valueScaled: z.int().positive(), unit: unitSchema }),
    asOf: isoInstantSchema,
  })
  .superRefine((input, ctx) => {
    if (input.quantity.unit !== input.unit) {
      ctx.addIssue({
        code: "custom",
        path: ["quantity", "unit"],
        message: "Price resolution does not convert quantity units.",
      });
    }
  });
export type ResolvePriceInput = z.infer<typeof resolvePriceInputSchema>;

export const priceResolutionStatusSchema = z.enum(["selected", "none", "ambiguous"]);
export type PriceResolutionStatus = z.infer<typeof priceResolutionStatusSchema>;
export const priceResolutionDtoSchema = z.object({
  status: priceResolutionStatusSchema,
  selected: priceRuleDtoSchema.nullable(),
  candidates: z.array(priceRuleDtoSchema),
});
export type PriceResolutionDto = z.infer<typeof priceResolutionDtoSchema>;
