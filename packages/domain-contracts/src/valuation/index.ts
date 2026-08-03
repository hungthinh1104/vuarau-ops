import { z } from "zod";
import { currencyCodeSchema, moneySchema } from "../shared/money.ts";
import {
  inventoryMovementIdSchema,
  productIdSchema,
  qualityGradeIdSchema,
  workspaceIdSchema,
  workspacePolicyVersionIdSchema,
} from "../shared/ids.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { unitSchema } from "../shared/quantity.ts";

/** Supported deterministic valuation strategies. No strategy is implicit. */
export const INVENTORY_VALUATION_STRATEGIES = [
  "moving_weighted_average",
  "fifo",
  "specific_actual_cost",
  "no_valuation",
] as const;
export const inventoryValuationStrategySchema = z.enum(INVENTORY_VALUATION_STRATEGIES);
export type InventoryValuationStrategy = z.infer<typeof inventoryValuationStrategySchema>;

/** Supported cost-allocation bases for future landed-cost inputs. */
export const COST_ALLOCATION_STRATEGIES = [
  "quantity",
  "weight",
  "purchase_line_value",
  "packed_output",
  "manual",
] as const;
export const costAllocationStrategySchema = z.enum(COST_ALLOCATION_STRATEGIES);
export type CostAllocationStrategy = z.infer<typeof costAllocationStrategySchema>;

export const inventoryValuationPolicyDefinitionSchema = z.object({
  contractVersion: z.literal(1),
  parameters: z.object({
    strategy: inventoryValuationStrategySchema,
  }),
});
export type InventoryValuationPolicyDefinition = z.infer<
  typeof inventoryValuationPolicyDefinitionSchema
>;

export const costAllocationPolicyDefinitionSchema = z.object({
  contractVersion: z.literal(1),
  parameters: z.object({
    strategy: costAllocationStrategySchema,
  }),
});
export type CostAllocationPolicyDefinition = z.infer<typeof costAllocationPolicyDefinitionSchema>;

export const inventoryValuationInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  productId: productIdSchema,
  qualityGradeId: qualityGradeIdSchema.nullable().default(null),
  unit: unitSchema.nullable().default(null),
  asOf: isoInstantSchema,
});
export type InventoryValuationInput = z.infer<typeof inventoryValuationInputSchema>;

export const inventoryValuationSourceSchema = z.object({
  movementId: inventoryMovementIdSchema,
  sourceType: z.string().min(1),
  sourceId: z.string().uuid(),
  sourceLineId: z.string().uuid().nullable(),
});
export type InventoryValuationSource = z.infer<typeof inventoryValuationSourceSchema>;

export const inventoryValuationRowSchema = z.object({
  qualityGradeId: qualityGradeIdSchema.nullable(),
  unit: unitSchema,
  quantityScaled: z.int(),
  inventoryValue: moneySchema.nullable(),
  cogs: moneySchema.nullable(),
  averageUnitCost: moneySchema.nullable(),
});
export type InventoryValuationRow = z.infer<typeof inventoryValuationRowSchema>;

export const inventoryValuationDtoSchema = z.object({
  status: z.literal("available"),
  workspaceId: workspaceIdSchema,
  productId: productIdSchema,
  asOf: isoInstantSchema,
  policyVersionId: workspacePolicyVersionIdSchema,
  strategy: inventoryValuationStrategySchema,
  calculationVersion: z.literal("inventory-valuation-v1"),
  calculatedAt: isoInstantSchema,
  integrity: z.enum(["healthy", "attention"]),
  diagnostics: z.array(z.string()),
  inputReferences: z.array(inventoryValuationSourceSchema),
  rows: z.array(inventoryValuationRowSchema),
  currency: currencyCodeSchema.nullable(),
});
export type InventoryValuationDto = z.infer<typeof inventoryValuationDtoSchema>;

export const inventoryValuationUnavailableSchema = z.object({
  status: z.literal("unavailable"),
  workspaceId: workspaceIdSchema,
  productId: productIdSchema,
  asOf: isoInstantSchema,
  policyVersionId: workspacePolicyVersionIdSchema.nullable(),
  calculationVersion: z.literal("inventory-valuation-v1"),
  calculatedAt: isoInstantSchema,
  integrity: z.literal("attention"),
  diagnostics: z.array(z.string()).min(1),
  inputReferences: z.array(inventoryValuationSourceSchema),
  currency: currencyCodeSchema.nullable(),
});
export type InventoryValuationUnavailable = z.infer<typeof inventoryValuationUnavailableSchema>;

export const inventoryValuationResultSchema = z.discriminatedUnion("status", [
  inventoryValuationDtoSchema,
  inventoryValuationUnavailableSchema,
]);
export type InventoryValuationResult = z.infer<typeof inventoryValuationResultSchema>;
