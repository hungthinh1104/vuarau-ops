import { z } from "zod";
import { customerIdSchema, workspaceIdSchema } from "../shared/ids.ts";
import { defineCommand, defineVersionedCommand } from "../shared/command.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { moneySchema } from "../shared/money.ts";
import { capabilitySchema } from "../shared/capability.ts";
import { pageRequestSchema } from "../shared/pagination.ts";
import { balanceClassificationSchema } from "../account/index.ts";

/**
 * Customers are master data, not financial records: they may be edited and
 * deactivated. Their debt lives entirely in the ledger (ADR-0004).
 */

/**
 * The id is supplied by the client, not the server. A worker on a 4G dead spot
 * must be able to create a customer and immediately attach a sale to them, and
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

/**
 * A **named** command, not a generic patch. There is no `updateEntity` in this
 * system and none is to be added: a generic patch is how a lifecycle field ends
 * up changed by code that had no business touching it (BR-CUSTOMER-004).
 *
 * Note what is absent: `isActive` — that is `DeactivateCustomer`, a different
 * decision with a different permission — and anything to do with money.
 */
export const updateCustomerPayloadSchema = z.object({
  customerId: customerIdSchema,
  displayName: z.string().max(200),
  phone: z.string().trim().max(40).nullable().default(null),
  note: z.string().trim().max(1000).nullable().default(null),
});
export type UpdateCustomerPayload = z.infer<typeof updateCustomerPayloadSchema>;

export const updateCustomerCommandSchema = defineVersionedCommand(updateCustomerPayloadSchema);
export type UpdateCustomerCommand = z.infer<typeof updateCustomerCommandSchema>;

/**
 * Hides a customer from new sales. It does **not** delete them and does not
 * settle their balance: a deactivated customer who owes money still owes it, and
 * still appears in the account book (BR-CUSTOMER-003).
 *
 * Anything else would make "tidy up the customer list" a way to make debt vanish.
 */
export const deactivateCustomerPayloadSchema = z.object({
  customerId: customerIdSchema,
  reason: z.string().trim().max(500).nullable().default(null),
});
export type DeactivateCustomerPayload = z.infer<typeof deactivateCustomerPayloadSchema>;

export const deactivateCustomerCommandSchema = defineVersionedCommand(
  deactivateCustomerPayloadSchema,
);
export type DeactivateCustomerCommand = z.infer<typeof deactivateCustomerCommandSchema>;

export const reactivateCustomerPayloadSchema = z.object({
  customerId: customerIdSchema,
  reason: z.string().trim().min(1).max(500),
});
export const reactivateCustomerCommandSchema = defineVersionedCommand(
  reactivateCustomerPayloadSchema,
);
export type ReactivateCustomerCommand = z.infer<typeof reactivateCustomerCommandSchema>;

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

// --- reads -------------------------------------------------------------------

export const customerCapabilitiesSchema = z.object({
  update: capabilitySchema,
  deactivate: capabilitySchema,
  reactivate: capabilitySchema,
  adjustAccount: capabilitySchema,
});
export type CustomerCapabilities = z.infer<typeof customerCapabilitiesSchema>;

/**
 * UC-CUSTOMER-002 — the list a worker picks from before starting a sale.
 *
 * It carries the balance, because the question "who is this and what do they
 * owe" is one question in a depot and answering it in two round trips means the
 * list and the balance can disagree on screen.
 */
export const customerSummaryDtoSchema = z.object({
  id: customerIdSchema,
  workspaceId: workspaceIdSchema,
  displayName: z.string(),
  phone: z.string().nullable(),
  isActive: z.boolean(),
  version: z.int().nonnegative(),
  /** Signed, with its meaning named — a client never inspects the sign itself. */
  balance: moneySchema,
  classification: balanceClassificationSchema,
  lastEntryTransactionTime: isoInstantSchema.nullable(),
  capabilities: customerCapabilitiesSchema,
});
export type CustomerSummaryDto = z.infer<typeof customerSummaryDtoSchema>;

/** `CustomerDto` plus the caller's capabilities and the account balance. */
export const customerDetailDtoSchema = z.object({
  customer: customerDtoSchema,
  balance: moneySchema,
  classification: balanceClassificationSchema,
  capabilities: customerCapabilitiesSchema,
});
export type CustomerDetailDto = z.infer<typeof customerDetailDtoSchema>;

export const searchCustomersInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  /**
   * Matches display name and phone. Diacritic-insensitive: a worker on a phone
   * keyboard at a loading bay types "co hoa" and has to find "Cô Hoà"
   * (UC-CUSTOMER-002). Blank means "everything".
   */
  query: z.string().trim().max(200).default(""),
  /** `null` means both. Not defaulted to active-only: a deactivated customer who
   *  still owes money must remain findable (BR-CUSTOMER-003). */
  isActive: z.boolean().nullable().default(null),
});
export type SearchCustomersInput = z.infer<typeof searchCustomersInputSchema>;

export const getCustomerInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
});
export type GetCustomerInput = z.infer<typeof getCustomerInputSchema>;

/** A short, active-only list ordered by the customer's last active posted sale. */
export const recentCustomersInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  limit: z.int().min(1).max(12).default(10),
});
export type RecentCustomersInput = z.infer<typeof recentCustomersInputSchema>;

export const recentCustomerDtoSchema = z.object({
  customerId: customerIdSchema,
  displayName: z.string(),
  phone: z.string().nullable(),
  balance: moneySchema,
  classification: balanceClassificationSchema,
  lastSaleTransactionTime: isoInstantSchema.nullable(),
});
export type RecentCustomerDto = z.infer<typeof recentCustomerDtoSchema>;

export const duplicateCustomerInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  displayName: z.string().trim().max(200),
  phone: z.string().trim().max(40).nullable(),
  excludeCustomerId: customerIdSchema.nullable().default(null),
});
export type DuplicateCustomerInput = z.infer<typeof duplicateCustomerInputSchema>;

export const duplicateCustomerCandidateDtoSchema = z.object({
  customer: customerSummaryDtoSchema,
  reasons: z.array(z.enum(["same_name", "same_phone"])).min(1),
});
export type DuplicateCustomerCandidateDto = z.infer<typeof duplicateCustomerCandidateDtoSchema>;
