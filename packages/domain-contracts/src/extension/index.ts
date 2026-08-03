import { z } from "zod";

/**
 * Capabilities reserved for product-specific variants and experiments. They
 * are named here so a future adapter has an explicit boundary to cross; this
 * list is not an activation registry and none of these capabilities is part
 * of the core runtime.
 */
export const CORE_EXTENSION_CAPABILITIES = [
  "product_variant",
  "ai_transaction_entry",
  "ocr_capture",
  "demand_forecast",
  "supplier_scoring",
  "route_optimization",
  "experimental_workflow",
] as const;
export const extensionCapabilitySchema = z.enum(CORE_EXTENSION_CAPABILITIES);
export type ExtensionCapability = z.infer<typeof extensionCapabilitySchema>;

export const EXTENSION_LIFECYCLE_STATES = ["reserved", "experimental"] as const;
export const extensionLifecycleStateSchema = z.enum(EXTENSION_LIFECYCLE_STATES);
export type ExtensionLifecycleState = z.infer<typeof extensionLifecycleStateSchema>;

/** The only two execution paths an extension may use at the core boundary. */
export const EXTENSION_EXECUTION_MODES = ["proposal_only", "canonical_command"] as const;
export const extensionExecutionModeSchema = z.enum(EXTENSION_EXECUTION_MODES);
export type ExtensionExecutionMode = z.infer<typeof extensionExecutionModeSchema>;

/**
 * This declaration is metadata for review and adapter design. It is not a
 * command payload and cannot grant an extension permission to mutate core
 * facts. Direct effects are intentionally not representable by this schema.
 */
export const extensionBoundaryDeclarationSchema = z.object({
  contractVersion: z.literal(1),
  capability: extensionCapabilitySchema,
  lifecycle: extensionLifecycleStateSchema,
  executionMode: extensionExecutionModeSchema,
  workspaceScoped: z.literal(true),
  directCoreEffects: z.literal(false),
});
export type ExtensionBoundaryDeclaration = z.infer<typeof extensionBoundaryDeclarationSchema>;

/** The core source of truth for what remains outside the core product. */
export const CORE_EXTENSION_BOUNDARY = [
  "product_variant",
  "ai_transaction_entry",
  "ocr_capture",
  "demand_forecast",
  "supplier_scoring",
  "route_optimization",
  "experimental_workflow",
] as const satisfies readonly ExtensionCapability[];
