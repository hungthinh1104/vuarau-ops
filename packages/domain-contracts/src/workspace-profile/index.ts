import { z } from "zod";
import { defineVersionedCommand } from "../shared/command.ts";
import { workspaceIdSchema } from "../shared/ids.ts";

export const PURCHASING_MODES = ["disabled", "purchase_receiving"] as const;
export const INVENTORY_MODES = ["disabled", "movement_ledger"] as const;
export const QUALITY_GRADE_MODES = ["disabled", "required"] as const;
export const DELIVERY_MODES = ["disabled", "sale_fulfilment"] as const;
export const CASHBOOK_MODES = ["disabled", "accounts_ledger"] as const;
export const INTAKE_MODES = ["direct_receipt", "inspected_arrival"] as const;
export const WEIGHING_MODES = ["quantity_only", "gross_tare_net"] as const;

export const purchasingModeSchema = z.enum(PURCHASING_MODES);
export const inventoryModeSchema = z.enum(INVENTORY_MODES);
export const qualityGradeModeSchema = z.enum(QUALITY_GRADE_MODES);
export const deliveryModeSchema = z.enum(DELIVERY_MODES);
export const cashbookModeSchema = z.enum(CASHBOOK_MODES);
export const intakeModeSchema = z.enum(INTAKE_MODES);
export const weighingModeSchema = z.enum(WEIGHING_MODES);

export const WORKSPACE_WORKFLOWS = [
  "purchasing",
  "inventory",
  "quality_grading",
  "delivery",
  "cashbook",
  "direct_receiving",
  "inspected_intake",
  "weighing",
] as const;
export const workspaceWorkflowSchema = z.enum(WORKSPACE_WORKFLOWS);
export type WorkspaceWorkflow = z.infer<typeof workspaceWorkflowSchema>;

export const operationalProfileFieldsSchema = z
  .object({
    purchasingMode: purchasingModeSchema,
    inventoryMode: inventoryModeSchema,
    qualityGradeMode: qualityGradeModeSchema,
    deliveryMode: deliveryModeSchema,
    cashbookMode: cashbookModeSchema.default("disabled"),
    intakeMode: intakeModeSchema.default("direct_receipt"),
    weighingMode: weighingModeSchema.default("quantity_only"),
    /** Local minute after midnight at which the depot's business day starts. */
    businessDayStartMinute: z.int().min(0).max(1439),
  })
  .superRefine((profile, ctx) => {
    if (profile.purchasingMode !== "disabled" && profile.inventoryMode === "disabled") {
      ctx.addIssue({
        code: "custom",
        path: ["purchasingMode"],
        message: "Purchase/Receiving requires inventory tracking.",
      });
    }
    if (profile.deliveryMode !== "disabled" && profile.inventoryMode === "disabled") {
      ctx.addIssue({
        code: "custom",
        path: ["deliveryMode"],
        message: "Delivery fulfilment requires inventory tracking.",
      });
    }
    if (profile.qualityGradeMode === "required" && profile.inventoryMode === "disabled") {
      ctx.addIssue({
        code: "custom",
        path: ["qualityGradeMode"],
        message: "Required quality grading needs inventory tracking.",
      });
    }
    if (
      profile.intakeMode === "inspected_arrival" &&
      (profile.purchasingMode === "disabled" || profile.inventoryMode === "disabled")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["intakeMode"],
        message: "Inspected arrival requires Purchasing and Inventory.",
      });
    }
  });
export type OperationalProfileFields = z.infer<typeof operationalProfileFieldsSchema>;

export const DEFAULT_OPERATIONAL_PROFILE: OperationalProfileFields = Object.freeze({
  purchasingMode: "purchase_receiving",
  inventoryMode: "movement_ledger",
  qualityGradeMode: "required",
  deliveryMode: "sale_fulfilment",
  cashbookMode: "disabled",
  intakeMode: "direct_receipt",
  weighingMode: "quantity_only",
  businessDayStartMinute: 0,
});

export const workspaceOperationalProfileDtoSchema = operationalProfileFieldsSchema.extend({
  workspaceId: workspaceIdSchema,
  version: z.int().positive(),
});
export type WorkspaceOperationalProfileDto = z.infer<
  typeof workspaceOperationalProfileDtoSchema
>;

export function defaultWorkspaceOperationalProfile(
  workspaceId: z.infer<typeof workspaceIdSchema>,
): WorkspaceOperationalProfileDto {
  return { workspaceId, version: 1, ...DEFAULT_OPERATIONAL_PROFILE };
}

export const updateWorkspaceOperationalProfilePayloadSchema =
  operationalProfileFieldsSchema.extend({
    reason: z.string().trim().min(1).max(500),
  });
export const updateWorkspaceOperationalProfileCommandSchema = defineVersionedCommand(
  updateWorkspaceOperationalProfilePayloadSchema,
);
export type UpdateWorkspaceOperationalProfileCommand = z.infer<
  typeof updateWorkspaceOperationalProfileCommandSchema
>;

export function workspaceWorkflowEnabled(
  profile: OperationalProfileFields,
  workflow: WorkspaceWorkflow,
): boolean {
  if (workflow === "purchasing") return profile.purchasingMode !== "disabled";
  if (workflow === "inventory") return profile.inventoryMode !== "disabled";
  if (workflow === "quality_grading") return profile.qualityGradeMode !== "disabled";
  if (workflow === "delivery") return profile.deliveryMode !== "disabled";
  if (workflow === "cashbook") return profile.cashbookMode !== "disabled";
  if (workflow === "direct_receiving") return profile.intakeMode === "direct_receipt";
  if (workflow === "inspected_intake") return profile.intakeMode === "inspected_arrival";
  return profile.weighingMode === "gross_tare_net";
}
