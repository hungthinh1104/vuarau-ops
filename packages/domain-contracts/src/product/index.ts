import { z } from "zod";
import { defineCommand, defineVersionedCommand } from "../shared/command.ts";
import { pageOf, pageRequestSchema } from "../shared/pagination.ts";
import { productIdSchema, workspaceIdSchema } from "../shared/ids.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { unitSchema } from "../shared/quantity.ts";

const productFields = z.object({
  productId: productIdSchema,
  displayName: z.string().max(200),
  aliases: z.array(z.string().max(200)).max(30).default([]),
  preferredUnit: unitSchema.nullable().default(null),
});

export const createProductCommandSchema = defineCommand(productFields);
export type CreateProductCommand = z.infer<typeof createProductCommandSchema>;

export const updateProductCommandSchema = defineVersionedCommand(productFields);
export type UpdateProductCommand = z.infer<typeof updateProductCommandSchema>;

const lifecyclePayload = z.object({
  productId: productIdSchema,
  reason: z.string().trim().min(1).max(500),
});
export const deactivateProductCommandSchema = defineVersionedCommand(lifecyclePayload);
export type DeactivateProductCommand = z.infer<typeof deactivateProductCommandSchema>;
export const reactivateProductCommandSchema = defineVersionedCommand(lifecyclePayload);
export type ReactivateProductCommand = z.infer<typeof reactivateProductCommandSchema>;

export const productDtoSchema = z.object({
  id: productIdSchema,
  workspaceId: workspaceIdSchema,
  displayName: z.string(),
  aliases: z.array(z.string()),
  preferredUnit: unitSchema.nullable(),
  isActive: z.boolean(),
  version: z.int().positive(),
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
});
export type ProductDto = z.infer<typeof productDtoSchema>;

export const productSearchInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  query: z.string().trim().max(200).default(""),
  isActive: z.boolean().nullable().default(true),
});
export const productSearchPageSchema = pageOf(productDtoSchema);
export type ProductSearchInput = z.infer<typeof productSearchInputSchema>;

export const productGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  productId: productIdSchema,
});
