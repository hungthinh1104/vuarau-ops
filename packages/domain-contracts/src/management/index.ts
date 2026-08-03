import { z } from "zod";
import { reportTypeSchema, REPORT_TYPES } from "../report/index.ts";
import { workspaceIdSchema, workspacePolicyVersionIdSchema } from "../shared/ids.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { moneySchema } from "../shared/money.ts";
import { unitSchema } from "../shared/quantity.ts";

/**
 * Management intelligence is intentionally a source-backed snapshot, not a
 * second calculation engine for COGS, profit, forecast, score or recommendation.
 */
export const MANAGEMENT_INTELLIGENCE_STRATEGIES = ["operational_report_snapshot"] as const;
export const managementIntelligenceStrategySchema = z.enum(MANAGEMENT_INTELLIGENCE_STRATEGIES);
export type ManagementIntelligenceStrategy = z.infer<typeof managementIntelligenceStrategySchema>;

export const managementIntelligencePolicyDefinitionSchema = z.object({
  contractVersion: z.literal(1),
  parameters: z.object({
    strategy: managementIntelligenceStrategySchema,
    reportTypes: z
      .array(reportTypeSchema)
      .min(1)
      .max(REPORT_TYPES.length)
      .refine((reportTypes) => new Set(reportTypes).size === reportTypes.length, {
        message: "Management intelligence report types must be unique.",
      }),
  }),
});
export type ManagementIntelligencePolicyDefinition = z.infer<
  typeof managementIntelligencePolicyDefinitionSchema
>;

export const managementIntelligenceInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  asOf: isoInstantSchema,
  businessDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});
export type ManagementIntelligenceInput = z.infer<typeof managementIntelligenceInputSchema>;

const managementIndicatorSchema = z.object({
  reportType: reportTypeSchema,
  businessDate: z.string().nullable(),
  integrity: z.enum(["healthy", "attention"]),
  totals: z.object({
    amount: moneySchema.nullable(),
    quantities: z.array(z.object({ unit: unitSchema, valueScaled: z.int() })),
  }),
  sourceReportType: reportTypeSchema,
  diagnostics: z.array(z.string()),
});
export type ManagementIndicator = z.infer<typeof managementIndicatorSchema>;

export const managementIntelligenceDtoSchema = z.object({
  workspaceId: workspaceIdSchema,
  asOf: isoInstantSchema,
  businessDate: z.string().nullable(),
  status: z.enum(["available", "unavailable"]),
  policyVersionId: workspacePolicyVersionIdSchema.nullable(),
  policyVersion: z.int().positive().nullable(),
  strategy: managementIntelligenceStrategySchema.nullable(),
  calculationVersion: z.literal("management-intelligence-v1"),
  diagnostics: z.array(z.string()),
  sourceReportTypes: z.array(reportTypeSchema),
  indicators: z.array(managementIndicatorSchema),
});
export type ManagementIntelligenceDto = z.infer<typeof managementIntelligenceDtoSchema>;
