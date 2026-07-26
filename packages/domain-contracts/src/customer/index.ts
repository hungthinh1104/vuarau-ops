import { z } from "zod";
import { customerIdSchema, workspaceIdSchema } from "../shared/ids.ts";
import { defineCommand } from "../shared/command.ts";
import { isoInstantSchema } from "../shared/time.ts";

/**
 * Customers are master data, not financial records: they may be edited and
 * deactivated. Their debt lives entirely in the ledger (ADR-0004).
 */

/**
 * The id is supplied by the client, not the server. A worker on a 4G dead spot
 * must be able to create a customer and immediately attach an order to them, and
 * the retry of that create must not mint a second customer.
 */
export const createCustomerPayloadSchema = z.object({
  customerId: customerIdSchema,
  // Non-blankness is BR-CUSTOMER-001, enforced by the domain so the refusal
  // carries `CUSTOMER_NAME_REQUIRED` rather than a generic schema error.
  displayName: z.string().max(200),
  phone: z.string().trim().max(40).nullable().default(null),
  note: z.string().trim().max(1000).nullable().default(null),
});
export type CreateCustomerPayload = z.infer<typeof createCustomerPayloadSchema>;

export const createCustomerCommandSchema = defineCommand(createCustomerPayloadSchema);
export type CreateCustomerCommand = z.infer<typeof createCustomerCommandSchema>;

export const customerDtoSchema = z.object({
  id: customerIdSchema,
  workspaceId: workspaceIdSchema,
  displayName: z.string(),
  phone: z.string().nullable(),
  note: z.string().nullable(),
  isActive: z.boolean(),
  version: z.int().nonnegative(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
});
export type CustomerDto = z.infer<typeof customerDtoSchema>;

export const customerCreatedEventSchema = z.object({
  type: z.literal("customer.created"),
  customerId: customerIdSchema,
  workspaceId: workspaceIdSchema,
  displayName: z.string(),
  transactionTime: isoInstantSchema,
});
export type CustomerCreatedEvent = z.infer<typeof customerCreatedEventSchema>;
