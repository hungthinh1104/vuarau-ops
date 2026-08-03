import { z } from "zod";
import { defineCommand, defineVersionedCommand } from "../shared/command.ts";
import { currencyCodeSchema, moneySchema } from "../shared/money.ts";
import { pageOf, pageRequestSchema } from "../shared/pagination.ts";
import {
  customerIdSchema,
  customerOrderIdSchema,
  customerOrderLineIdSchema,
  productIdSchema,
  workspaceIdSchema,
} from "../shared/ids.ts";
import { quantitySchema } from "../shared/quantity.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { evidenceReferencesDtoSchema, evidenceReferencesInputSchema } from "../shared/evidence.ts";
import { capabilitySchema } from "../shared/capability.ts";

/** A commercial request is distinct from a posted Sale and has no account effect. */
export const CUSTOMER_ORDER_STATUSES = ["draft", "confirmed", "cancelled"] as const;
export const customerOrderStatusSchema = z.enum(CUSTOMER_ORDER_STATUSES);
export type CustomerOrderStatus = z.infer<typeof customerOrderStatusSchema>;

export const CUSTOMER_ORDER_CHANNELS = [
  "account_customer",
  "walk_in",
  "contract_customer",
  "internal_transfer",
] as const;
export const customerOrderChannelSchema = z.enum(CUSTOMER_ORDER_CHANNELS);
export type CustomerOrderChannel = z.infer<typeof customerOrderChannelSchema>;

/** Snapshot, not a live reference to a future workspace terms policy. */
export const paymentTermsSnapshotSchema = z
  .object({
    label: z.string().trim().min(1).max(200),
    dueAt: isoInstantSchema.nullable(),
  })
  .nullable()
  .default(null);
export type PaymentTermsSnapshot = z.infer<typeof paymentTermsSnapshotSchema>;

export const customerOrderLineInputSchema = z.object({
  lineId: customerOrderLineIdSchema,
  /** Drafts may retain an unresolved catalogue identity; confirmation may not. */
  productId: productIdSchema.nullable().default(null),
  productName: z.string().trim().min(1).max(200),
  quantity: quantitySchema,
  /** A request may be unpriced while being negotiated; confirmation requires it. */
  agreedUnitPrice: moneySchema.nullable().default(null),
});
export type CustomerOrderLineInput = z.infer<typeof customerOrderLineInputSchema>;

const customerOrderDraftFields = z.object({
  customerOrderId: customerOrderIdSchema,
  customerId: customerIdSchema.nullable().default(null),
  channel: customerOrderChannelSchema,
  currency: currencyCodeSchema,
  lines: z.array(customerOrderLineInputSchema).max(200),
  note: z.string().trim().max(2_000).nullable().default(null),
  paymentTermsSnapshot: paymentTermsSnapshotSchema,
  evidenceReferences: evidenceReferencesInputSchema,
  replacesCustomerOrderId: customerOrderIdSchema.nullable().default(null),
});

export const createCustomerOrderDraftCommandSchema = defineCommand(customerOrderDraftFields);
export type CreateCustomerOrderDraftCommand = z.infer<typeof createCustomerOrderDraftCommandSchema>;
export const updateCustomerOrderDraftCommandSchema =
  defineVersionedCommand(customerOrderDraftFields);
export type UpdateCustomerOrderDraftCommand = z.infer<typeof updateCustomerOrderDraftCommandSchema>;

export const confirmCustomerOrderCommandSchema = defineVersionedCommand(
  z.object({ customerOrderId: customerOrderIdSchema }),
);
export type ConfirmCustomerOrderCommand = z.infer<typeof confirmCustomerOrderCommandSchema>;

export const cancelCustomerOrderCommandSchema = defineVersionedCommand(
  z.object({
    customerOrderId: customerOrderIdSchema,
    reason: z.string().trim().min(1).max(500),
  }),
);
export type CancelCustomerOrderCommand = z.infer<typeof cancelCustomerOrderCommandSchema>;

export const customerOrderLineDtoSchema = customerOrderLineInputSchema.extend({
  lineTotal: moneySchema.nullable(),
});
export type CustomerOrderLineDto = z.infer<typeof customerOrderLineDtoSchema>;

export const customerOrderCapabilitiesSchema = z.object({
  edit: capabilitySchema,
  confirm: capabilitySchema,
  cancel: capabilitySchema,
});
export type CustomerOrderCapabilities = z.infer<typeof customerOrderCapabilitiesSchema>;

export const customerOrderDtoSchema = z.object({
  id: customerOrderIdSchema,
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema.nullable(),
  channel: customerOrderChannelSchema,
  status: customerOrderStatusSchema,
  currency: currencyCodeSchema,
  lines: z.array(customerOrderLineDtoSchema),
  totalAmount: moneySchema.nullable(),
  note: z.string().nullable(),
  paymentTermsSnapshot: paymentTermsSnapshotSchema,
  evidenceReferences: evidenceReferencesDtoSchema,
  version: z.int().positive(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  confirmedAt: isoInstantSchema.nullable(),
  cancelledAt: isoInstantSchema.nullable(),
  cancellationReason: z.string().nullable(),
  replacesCustomerOrderId: customerOrderIdSchema.nullable(),
  capabilities: customerOrderCapabilitiesSchema,
});
export type CustomerOrderDto = z.infer<typeof customerOrderDtoSchema>;

export const customerOrderGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  customerOrderId: customerOrderIdSchema,
});
export type CustomerOrderGetInput = z.infer<typeof customerOrderGetInputSchema>;
export const customerOrderListInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema.nullable().default(null),
  status: customerOrderStatusSchema.nullable().default(null),
});
export type CustomerOrderListInput = z.infer<typeof customerOrderListInputSchema>;
export const customerOrderListPageSchema = pageOf(customerOrderDtoSchema);
