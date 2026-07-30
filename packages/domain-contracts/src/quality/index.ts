import { z } from "zod";
import { defineCommand, defineVersionedCommand } from "../shared/command.ts";
import { pageOf, pageRequestSchema } from "../shared/pagination.ts";
import { qualityGradeIdSchema, workspaceIdSchema } from "../shared/ids.ts";
import { isoInstantSchema } from "../shared/time.ts";

const qualityGradeFields = z.object({
  qualityGradeId: qualityGradeIdSchema,
  name: z.string().trim().min(1).max(100),
  sortOrder: z.int().min(-10_000).max(10_000),
});

export const createQualityGradeCommandSchema = defineCommand(qualityGradeFields);
export type CreateQualityGradeCommand = z.infer<typeof createQualityGradeCommandSchema>;

export const updateQualityGradeCommandSchema = defineVersionedCommand(qualityGradeFields);
export type UpdateQualityGradeCommand = z.infer<typeof updateQualityGradeCommandSchema>;

const lifecycleFields = z.object({
  qualityGradeId: qualityGradeIdSchema,
  reason: z.string().trim().min(1).max(500),
});
export const deactivateQualityGradeCommandSchema = defineVersionedCommand(lifecycleFields);
export type DeactivateQualityGradeCommand = z.infer<typeof deactivateQualityGradeCommandSchema>;
export const reactivateQualityGradeCommandSchema = defineVersionedCommand(lifecycleFields);
export type ReactivateQualityGradeCommand = z.infer<typeof reactivateQualityGradeCommandSchema>;

export const qualityGradeDtoSchema = z.object({
  id: qualityGradeIdSchema,
  workspaceId: workspaceIdSchema,
  name: z.string(),
  sortOrder: z.int(),
  isActive: z.boolean(),
  version: z.int().positive(),
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
});
export type QualityGradeDto = z.infer<typeof qualityGradeDtoSchema>;

export const qualityGradeListInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  query: z.string().trim().max(100).default(""),
  isActive: z.boolean().nullable().default(true),
});
export type QualityGradeListInput = z.infer<typeof qualityGradeListInputSchema>;
export const qualityGradePageSchema = pageOf(qualityGradeDtoSchema);

export const qualityGradeGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  qualityGradeId: qualityGradeIdSchema,
});
