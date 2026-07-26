import { z } from "zod";

/**
 * The stable vocabulary of business refusals.
 *
 * These strings are API. They may be deprecated but never renamed or reused, and
 * no client may branch on `message` — messages will become Vietnamese and will
 * change. See docs/04-business-rules/error-code-catalog.md.
 */
export const DOMAIN_REJECTION_CODES = [
  // --- workspace / authorization -------------------------------------------
  "WORKSPACE_ACCESS_DENIED",

  // --- customer -------------------------------------------------------------
  "CUSTOMER_NOT_FOUND",
  "CUSTOMER_NAME_REQUIRED",

  // --- order ----------------------------------------------------------------
  "ORDER_NOT_FOUND",
  "ORDER_EMPTY",
  "ORDER_LINE_INVALID",
  "ORDER_ALREADY_CONFIRMED",
  "ORDER_CANCELLED",
  "ORDER_VERSION_CONFLICT",
  "ORDER_CURRENCY_MISMATCH",

  // --- payment --------------------------------------------------------------
  "PAYMENT_AMOUNT_INVALID",
  "PAYMENT_NOT_FOUND",
  "PAYMENT_ALREADY_REVERSED",
  "PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT",
  "PAYMENT_REVERSAL_REASON_REQUIRED",
  "PAYMENT_VERSION_CONFLICT",
  "PAYMENT_CURRENCY_MISMATCH",

  // --- debt -----------------------------------------------------------------
  "DEBT_ADJUSTMENT_REASON_REQUIRED",
  "DEBT_ADJUSTMENT_AMOUNT_INVALID",

  // --- command plumbing -----------------------------------------------------
  "DUPLICATE_COMMAND",
  "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
  "COMMAND_IN_PROGRESS",
  "INVALID_COMMAND_PAYLOAD",
  "TRANSACTION_TIME_IN_FUTURE",

  /**
   * A capability that this phase does not implement (for example order
   * cancellation). Returned by capability probes so the UI can grey out a
   * control without inventing its own knowledge of the roadmap.
   */
  "COMMAND_NOT_AVAILABLE",
] as const;

export const domainRejectionCodeSchema = z.enum(DOMAIN_REJECTION_CODES);
export type DomainRejectionCode = z.infer<typeof domainRejectionCodeSchema>;

/**
 * Retryability is a property of the code, not of the call site — otherwise two
 * handlers eventually disagree about whether the same failure is worth retrying.
 * `true` means: the identical command may succeed later without human action.
 */
const RETRYABLE_CODES = new Set<DomainRejectionCode>(["COMMAND_IN_PROGRESS"]);

export function isRetryableCode(code: DomainRejectionCode): boolean {
  return RETRYABLE_CODES.has(code);
}
