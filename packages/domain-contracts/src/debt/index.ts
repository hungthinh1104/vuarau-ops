import { z } from "zod";
import {
  actorIdSchema,
  commandIdSchema,
  customerIdSchema,
  debtLedgerEntryIdSchema,
  workspaceIdSchema,
} from "../shared/ids.ts";
import { moneySchema } from "../shared/money.ts";
import { capabilitySchema } from "../shared/capability.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { defineCommand } from "../shared/command.ts";

/**
 * The debt ledger is the source of truth for what a customer owes (ADR-0004).
 * Entries are append-only. Nothing in this system updates or deletes one.
 *
 * Sign convention, applied everywhere without exception:
 *   positive amount ⇒ the customer owes MORE  (order confirmed, payment reversed)
 *   negative amount ⇒ the customer owes LESS  (payment recorded)
 *
 * See docs/07-data/ledger-model.md.
 */

export const LEDGER_SOURCE_TYPES = [
  "order_confirmation",
  "payment",
  "payment_reversal",
  "manual_adjustment",
] as const;
export const ledgerSourceTypeSchema = z.enum(LEDGER_SOURCE_TYPES);
export type LedgerSourceType = z.infer<typeof ledgerSourceTypeSchema>;

export const DEBT_ADJUSTMENT_REASON_CODES = [
  "opening_balance",
  "write_off",
  "data_entry_correction",
  "goodwill_discount",
  "other",
] as const;
export const debtAdjustmentReasonCodeSchema = z.enum(DEBT_ADJUSTMENT_REASON_CODES);
export type DebtAdjustmentReasonCode = z.infer<typeof debtAdjustmentReasonCodeSchema>;

export const debtLedgerEntryDtoSchema = z.object({
  id: debtLedgerEntryIdSchema,
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  /** Signed. See the sign convention above. */
  amount: moneySchema,
  sourceType: ledgerSourceTypeSchema,
  /**
   * Id of the record that caused this entry: an order, a payment, a payment
   * reversal, or an adjustment. Typed loosely because `sourceType` discriminates
   * it; the database enforces the pairing per source type.
   */
  sourceId: z.uuid(),
  /** Set when this entry compensates an earlier one. Never overwrites it. */
  reversalOfEntryId: debtLedgerEntryIdSchema.nullable(),
  reasonCode: debtAdjustmentReasonCodeSchema.nullable(),
  reason: z.string().nullable(),
  /** When the money event happened. Debt aging reads this. */
  transactionTime: isoInstantSchema,
  /** When we wrote it down. Audit reads this. */
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
});
export type DebtLedgerEntryDto = z.infer<typeof debtLedgerEntryDtoSchema>;

export const DEBT_ADJUSTMENT_DIRECTIONS = ["increase", "decrease"] as const;
export const debtAdjustmentDirectionSchema = z.enum(DEBT_ADJUSTMENT_DIRECTIONS);
export type DebtAdjustmentDirection = z.infer<typeof debtAdjustmentDirectionSchema>;

export const adjustCustomerDebtPayloadSchema = z.object({
  /** Client-supplied identity of the adjustment; becomes the ledger `sourceId`. */
  adjustmentId: z.uuid(),
  customerId: customerIdSchema,
  direction: debtAdjustmentDirectionSchema,
  /**
   * Always positive; `direction` decides the sign of the ledger entry.
   * Enforced by the domain (BR-ACCOUNT-008) for a stable rejection code.
   */
  amount: moneySchema,
  reasonCode: debtAdjustmentReasonCodeSchema,
  /**
   * Free text, mandatory (BR-ACCOUNT-003). A debt moved by hand without a stated
   * cause is fraud-shaped. Blankness is a domain refusal, not a schema error.
   */
  reason: z.string().max(500),
});
export type AdjustCustomerDebtPayload = z.infer<typeof adjustCustomerDebtPayloadSchema>;

export const adjustCustomerDebtCommandSchema = defineCommand(adjustCustomerDebtPayloadSchema);
export type AdjustCustomerDebtCommand = z.infer<typeof adjustCustomerDebtCommandSchema>;

/**
 * What this actor may do to this customer's debt, computed from their role
 * (BR-AUTH-004). Unlike order and payment capabilities — which come from
 * aggregate state — this one depends on *who is asking*, so it is computed in the
 * application layer, not the kernel.
 */
export const debtCapabilitiesSchema = z.object({
  adjust: capabilitySchema,
});
export type DebtCapabilities = z.infer<typeof debtCapabilitiesSchema>;

/**
 * A projection, not a fact. Always equal to the sum of the customer's ledger
 * entries, and rebuildable from them at any time (BR-ACCOUNT-001).
 */
export const customerDebtSummaryDtoSchema = z.object({
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  /** May be negative: that means the customer is in credit. See ASM-001. */
  balance: moneySchema,
  entryCount: z.int().nonnegative(),
  lastEntryTransactionTime: isoInstantSchema.nullable(),
  /** When this projection row was last recomputed. */
  updatedAt: isoInstantSchema,
  capabilities: debtCapabilitiesSchema,
});
export type CustomerDebtSummaryDto = z.infer<typeof customerDebtSummaryDtoSchema>;

export const debtAdjustedEventSchema = z.object({
  type: z.literal("debt.adjusted"),
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  amount: moneySchema,
  reasonCode: debtAdjustmentReasonCodeSchema,
  transactionTime: isoInstantSchema,
});
export type DebtAdjustedEvent = z.infer<typeof debtAdjustedEventSchema>;
