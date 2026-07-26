import { z } from "zod";
import {
  actorIdSchema,
  commandIdSchema,
  customerIdSchema,
  customerAccountEntryIdSchema,
  workspaceIdSchema,
} from "../shared/ids.ts";
import { moneySchema } from "../shared/money.ts";
import { capabilitySchema } from "../shared/capability.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { defineCommand } from "../shared/command.ts";

/**
 * The customer account ledger is the source of truth for what a customer owes
 * (ADR-0004).
 * Entries are append-only. Nothing in this system updates or deletes one.
 *
 * Sign convention, applied everywhere without exception:
 *   positive amount ⇒ the customer owes MORE  (sale posted, payment reversed)
 *   negative amount ⇒ the customer owes LESS  (payment recorded)
 *
 * See docs/07-data/ledger-model.md.
 */

export const ACCOUNT_ENTRY_SOURCE_TYPES = [
  "sale_posting",
  "sale_void",
  "payment",
  "payment_reversal",
  "manual_adjustment",
] as const;
export const accountEntrySourceTypeSchema = z.enum(ACCOUNT_ENTRY_SOURCE_TYPES);
export type AccountEntrySourceType = z.infer<typeof accountEntrySourceTypeSchema>;

/**
 * Why a balance was moved **without an underlying document**. Every code here
 * describes a situation no sale and no payment can express (BR-ACCOUNT-010).
 *
 * Correcting a wrong sale is deliberately not on this list: that is `VoidSale`
 * plus an optional replacement (ADR-0012). `data_entry_correction` is retained
 * for balances imported from elsewhere, not for posted sales.
 */
export const DEBT_ADJUSTMENT_REASON_CODES = [
  "opening_balance",
  "write_off",
  "dispute_settlement",
  "migration_correction",
  "data_entry_correction",
  "goodwill_discount",
  "other",
] as const;
export const debtAdjustmentReasonCodeSchema = z.enum(DEBT_ADJUSTMENT_REASON_CODES);
export type DebtAdjustmentReasonCode = z.infer<typeof debtAdjustmentReasonCodeSchema>;

export const customerAccountEntryDtoSchema = z.object({
  id: customerAccountEntryIdSchema,
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  /** Signed. See the sign convention above. */
  amount: moneySchema,
  sourceType: accountEntrySourceTypeSchema,
  /**
   * Id of the record that caused this entry: a sale, a sale void, a payment, a
   * payment reversal, or an adjustment. Typed loosely because `sourceType`
   * discriminates it; the database enforces the pairing per source type.
   */
  sourceId: z.uuid(),
  /** Set when this entry compensates an earlier one. Never overwrites it. */
  reversalOfEntryId: customerAccountEntryIdSchema.nullable(),
  reasonCode: debtAdjustmentReasonCodeSchema.nullable(),
  reason: z.string().nullable(),
  /** When the money event happened. Debt aging reads this. */
  transactionTime: isoInstantSchema,
  /** When we wrote it down. Audit reads this. */
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
});
export type CustomerAccountEntryDto = z.infer<typeof customerAccountEntryDtoSchema>;

export const DEBT_ADJUSTMENT_DIRECTIONS = ["increase", "decrease"] as const;
export const debtAdjustmentDirectionSchema = z.enum(DEBT_ADJUSTMENT_DIRECTIONS);
export type DebtAdjustmentDirection = z.infer<typeof debtAdjustmentDirectionSchema>;

export const adjustCustomerDebtPayloadSchema = z.object({
  /** Client-supplied identity of the adjustment; becomes the entry `sourceId`. */
  adjustmentId: z.uuid(),
  customerId: customerIdSchema,
  direction: debtAdjustmentDirectionSchema,
  /**
   * Always positive; `direction` decides the sign of the account entry.
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
 * (BR-AUTH-004). Unlike sale and payment capabilities — which come from
 * aggregate state — this one depends on *who is asking*, so it is computed in the
 * application layer, not the kernel.
 */
export const accountCapabilitiesSchema = z.object({
  adjust: capabilitySchema,
});
export type AccountCapabilities = z.infer<typeof accountCapabilitiesSchema>;

/**
 * What the balance means, named rather than left to the reader's arithmetic
 * (BR-ACCOUNT-009).
 *
 * Derived at read time and never stored: storing it would create a second source
 * of truth for the one number that must be unambiguous, and a row whose sign and
 * label disagree is worse than no label at all.
 *
 * It exists so the client does not compute it. "Is this negative?" is a trivial
 * test to duplicate and a costly one to get wrong — a UI that renders a credit
 * balance as a debt sends a worker to collect money from somebody the depot owes.
 */
export const BALANCE_CLASSIFICATIONS = ["receivable", "settled", "customer_credit"] as const;
export const balanceClassificationSchema = z.enum(BALANCE_CLASSIFICATIONS);
export type BalanceClassification = z.infer<typeof balanceClassificationSchema>;

/**
 * A projection, not a fact. Always equal to the sum of the customer's account
 * entries, and rebuildable from them at any time (BR-ACCOUNT-001).
 */
export const customerAccountBalanceDtoSchema = z.object({
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  /** Signed. Negative means the depot owes the customer — see `classification`. */
  balance: moneySchema,
  classification: balanceClassificationSchema,
  entryCount: z.int().nonnegative(),
  lastEntryTransactionTime: isoInstantSchema.nullable(),
  /** When this projection row was last recomputed. */
  updatedAt: isoInstantSchema,
  capabilities: accountCapabilitiesSchema,
});
export type CustomerAccountBalanceDto = z.infer<typeof customerAccountBalanceDtoSchema>;

export const debtAdjustedEventSchema = z.object({
  type: z.literal("debt.adjusted"),
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  amount: moneySchema,
  reasonCode: debtAdjustmentReasonCodeSchema,
  transactionTime: isoInstantSchema,
});
export type DebtAdjustedEvent = z.infer<typeof debtAdjustedEventSchema>;
