import { z } from "zod";
import {
  customerIdSchema,
  paymentIdSchema,
  paymentReversalIdSchema,
  workspaceIdSchema,
} from "../shared/ids.ts";
import { currencyCodeSchema, moneySchema } from "../shared/money.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { defineCommand, defineVersionedCommand } from "../shared/command.ts";
import { capabilitySchema } from "../shared/capability.ts";
import { pageRequestSchema } from "../shared/pagination.ts";

/**
 * Payment lifecycle: recorded → partially_reversed → reversed.
 * `reversed` is terminal. See docs/03-state-machines/payment-state-machine.md.
 *
 * The status is a stored consequence of `reversedAmount`, not an independently
 * settable field — there is no `setPaymentStatus` command and never will be.
 */
export const PAYMENT_STATUSES = ["recorded", "partially_reversed", "reversed"] as const;
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const PAYMENT_METHODS = ["cash", "bank_transfer", "other"] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const recordCustomerPaymentPayloadSchema = z.object({
  paymentId: paymentIdSchema,
  customerId: customerIdSchema,
  /** Positivity is BR-PAYMENT-001, enforced by the domain for a stable code. */
  amount: moneySchema,
  method: paymentMethodSchema,
  /**
   * Set when a relative or driver pays on the customer's behalf. The debt still
   * belongs to `customerId`; this is who physically handed over the money.
   */
  payerName: z.string().trim().max(200).nullable().default(null),
  note: z.string().trim().max(1000).nullable().default(null),
});
export type RecordCustomerPaymentPayload = z.infer<typeof recordCustomerPaymentPayloadSchema>;

export const recordCustomerPaymentCommandSchema = defineCommand(recordCustomerPaymentPayloadSchema);
export type RecordCustomerPaymentCommand = z.infer<typeof recordCustomerPaymentCommandSchema>;

export const reverseCustomerPaymentPayloadSchema = z.object({
  paymentId: paymentIdSchema,
  /** Client-supplied so a retried reversal is recognisably the same reversal. */
  reversalId: paymentReversalIdSchema,
  /** Partial reversals are supported; amount ≤ remaining reversible amount. */
  amount: moneySchema,
  /**
   * Undoing money always requires a stated cause (BR-PAYMENT-004). Blankness is
   * checked by the domain so the refusal is
   * `PAYMENT_REVERSAL_REASON_REQUIRED`, which the UI can act on.
   */
  reason: z.string().max(500),
});
export type ReverseCustomerPaymentPayload = z.infer<typeof reverseCustomerPaymentPayloadSchema>;

export const reverseCustomerPaymentCommandSchema = defineVersionedCommand(
  reverseCustomerPaymentPayloadSchema,
);
export type ReverseCustomerPaymentCommand = z.infer<typeof reverseCustomerPaymentCommandSchema>;

export const paymentCapabilitiesSchema = z.object({
  reverse: capabilitySchema,
});
export type PaymentCapabilities = z.infer<typeof paymentCapabilitiesSchema>;

export const paymentDtoSchema = z.object({
  id: paymentIdSchema,
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  amount: moneySchema,
  currency: currencyCodeSchema,
  method: paymentMethodSchema,
  payerName: z.string().nullable(),
  note: z.string().nullable(),
  status: paymentStatusSchema,
  /** Cumulative amount reversed so far. Monotonically increasing. */
  reversedAmount: moneySchema,
  /** `amount − reversedAmount`. Derived, exposed for the UI's benefit. */
  remainingReversibleAmount: moneySchema,
  version: z.int().nonnegative(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  capabilities: paymentCapabilitiesSchema,
});
export type PaymentDto = z.infer<typeof paymentDtoSchema>;

export const paymentReversalDtoSchema = z.object({
  id: paymentReversalIdSchema,
  workspaceId: workspaceIdSchema,
  paymentId: paymentIdSchema,
  amount: moneySchema,
  reason: z.string(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
});
export type PaymentReversalDto = z.infer<typeof paymentReversalDtoSchema>;

export const paymentRecordedEventSchema = z.object({
  type: z.literal("payment.recorded"),
  paymentId: paymentIdSchema,
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  amount: moneySchema,
  transactionTime: isoInstantSchema,
});

export const paymentReversedEventSchema = z.object({
  type: z.literal("payment.reversed"),
  paymentId: paymentIdSchema,
  reversalId: paymentReversalIdSchema,
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  amount: moneySchema,
  resultingStatus: paymentStatusSchema,
  transactionTime: isoInstantSchema,
});

export const paymentEventSchema = z.discriminatedUnion("type", [
  paymentRecordedEventSchema,
  paymentReversedEventSchema,
]);
export type PaymentEvent = z.infer<typeof paymentEventSchema>;

// --- reads -------------------------------------------------------------------

/** UC-PAYMENT-003 — a row in the day's takings. */
export const paymentSummaryDtoSchema = z.object({
  id: paymentIdSchema,
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  customerDisplayName: z.string(),
  amount: moneySchema,
  method: paymentMethodSchema,
  status: paymentStatusSchema,
  reversedAmount: moneySchema,
  /**
   * Computed here rather than left as `amount − reversedAmount` for the client.
   * A client that gets that subtraction wrong offers to reverse money that is not
   * there (BR-PAYMENT-003).
   */
  remainingReversibleAmount: moneySchema,
  payerName: z.string().nullable(),
  /** Server-stored capture note; receipt UI never relies on local form state. */
  note: z.string().nullable(),
  version: z.int().nonnegative(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  capabilities: paymentCapabilitiesSchema,
});
export type PaymentSummaryDto = z.infer<typeof paymentSummaryDtoSchema>;

export const getPaymentInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  paymentId: paymentIdSchema,
});
export type GetPaymentInput = z.infer<typeof getPaymentInputSchema>;

export const listPaymentsInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema.nullable().default(null),
  status: paymentStatusSchema.nullable().default(null),
  from: isoInstantSchema.nullable().default(null),
  to: isoInstantSchema.nullable().default(null),
});
export type ListPaymentsInput = z.infer<typeof listPaymentsInputSchema>;
