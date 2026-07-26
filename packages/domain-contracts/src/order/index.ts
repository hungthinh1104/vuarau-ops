import { z } from "zod";
import {
  customerIdSchema,
  orderIdSchema,
  orderLineIdSchema,
  productIdSchema,
  workspaceIdSchema,
} from "../shared/ids.ts";
import { currencyCodeSchema, moneySchema } from "../shared/money.ts";
import { quantitySchema } from "../shared/quantity.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { defineCommand, defineVersionedCommand } from "../shared/command.ts";
import { capabilitySchema } from "../shared/capability.ts";

/**
 * Order lifecycle: draft → confirmed → (cancelled).
 * Deliberately free of allocation, picking, delivery, invoice, and payment
 * state — those are separate lifecycle dimensions and adding them here is how
 * status enums rot. See docs/03-state-machines/order-state-machine.md.
 */
export const ORDER_STATUSES = ["draft", "confirmed", "cancelled"] as const;
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/**
 * Product name and unit price are SNAPSHOTS taken when the line was entered.
 * A confirmed order is a historical fact; later edits to the product catalogue
 * must not retroactively change what a customer owes (ASM-008).
 */
export const orderLineInputSchema = z.object({
  lineId: orderLineIdSchema,
  productId: productIdSchema,
  productName: z.string().trim().min(1).max(200),
  quantity: quantitySchema,
  /**
   * Price for one whole unit (one kg, one bó, one thùng). Zero is allowed —
   * depots give things away. Negative is refused by the domain with
   * `ORDER_LINE_INVALID` (BR-ORDER-003), not by this schema, so the client gets
   * the specific code and the offending line index.
   */
  unitPrice: moneySchema,
});
export type OrderLineInput = z.infer<typeof orderLineInputSchema>;

export const createOrderPayloadSchema = z.object({
  orderId: orderIdSchema,
  customerId: customerIdSchema,
  currency: currencyCodeSchema,
  /** A draft may legitimately be empty — the worker is still typing. */
  lines: z.array(orderLineInputSchema).max(200),
  note: z.string().trim().max(1000).nullable().default(null),
});
export type CreateOrderPayload = z.infer<typeof createOrderPayloadSchema>;

export const createOrderCommandSchema = defineCommand(createOrderPayloadSchema);
export type CreateOrderCommand = z.infer<typeof createOrderCommandSchema>;

export const confirmOrderPayloadSchema = z.object({
  orderId: orderIdSchema,
});
export type ConfirmOrderPayload = z.infer<typeof confirmOrderPayloadSchema>;

/** Confirmation mutates an existing aggregate, so the version is mandatory. */
export const confirmOrderCommandSchema = defineVersionedCommand(confirmOrderPayloadSchema);
export type ConfirmOrderCommand = z.infer<typeof confirmOrderCommandSchema>;

export const orderLineDtoSchema = orderLineInputSchema.extend({
  lineTotal: moneySchema,
});
export type OrderLineDto = z.infer<typeof orderLineDtoSchema>;

export const orderCapabilitiesSchema = z.object({
  confirm: capabilitySchema,
  cancel: capabilitySchema,
  adjust: capabilitySchema,
});
export type OrderCapabilities = z.infer<typeof orderCapabilitiesSchema>;

export const orderDtoSchema = z.object({
  id: orderIdSchema,
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  status: orderStatusSchema,
  currency: currencyCodeSchema,
  lines: z.array(orderLineDtoSchema),
  totalAmount: moneySchema,
  note: z.string().nullable(),
  version: z.int().nonnegative(),
  /** When the sale happened, per the worker. Drives debt aging. */
  transactionTime: isoInstantSchema,
  /** When we accepted the draft. */
  recordedAt: isoInstantSchema,
  confirmedAt: isoInstantSchema.nullable(),
  cancelledAt: isoInstantSchema.nullable(),
  capabilities: orderCapabilitiesSchema,
});
export type OrderDto = z.infer<typeof orderDtoSchema>;

export const orderCreatedEventSchema = z.object({
  type: z.literal("order.created"),
  orderId: orderIdSchema,
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  totalAmount: moneySchema,
  transactionTime: isoInstantSchema,
});

export const orderConfirmedEventSchema = z.object({
  type: z.literal("order.confirmed"),
  orderId: orderIdSchema,
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  totalAmount: moneySchema,
  transactionTime: isoInstantSchema,
});

export const orderEventSchema = z.discriminatedUnion("type", [
  orderCreatedEventSchema,
  orderConfirmedEventSchema,
]);
export type OrderEvent = z.infer<typeof orderEventSchema>;
