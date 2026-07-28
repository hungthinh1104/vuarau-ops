import { z } from "zod";

/**
 * The stable vocabulary of business refusals.
 *
 * These strings are API. They may be deprecated but never renamed or reused, and
 * no client may branch on `message` — messages will become Vietnamese and will
 * change. See docs/04-business-rules/error-code-catalog.md.
 */
export const DOMAIN_REJECTION_CODES = [
  // --- authentication -------------------------------------------------------
  /** No credential was presented at all. */
  "AUTHENTICATION_REQUIRED",
  /** A credential was presented and is not trustworthy: bad signature, expired,
   *  wrong issuer or audience. Deliberately does not say which. */
  "AUTHENTICATION_INVALID",
  /** The token verified, but its subject maps to no actor in this system. */
  "ACTOR_NOT_FOUND",
  /** The command claims an `actorId` that is not the authenticated actor. */
  "ACTOR_IMPERSONATION_DENIED",

  // --- workspace / authorization -------------------------------------------
  /** The actor is not a member of the target workspace. */
  "WORKSPACE_ACCESS_DENIED",
  /** Membership exists but has been deactivated. Distinct from never having had
   *  access, because the operator's remedy is different. */
  "WORKSPACE_MEMBERSHIP_INACTIVE",
  /** The actor is an active member, but their role lacks the permission. */
  "PERMISSION_DENIED",
  /**
   * Revoking the only remaining active owner. Refused, because a depot that locks
   * itself out of its own account book has no self-service remedy (BR-AUTH-007).
   */
  "WORKSPACE_LAST_OWNER",
  "WORKSPACE_MEMBER_NOT_FOUND",
  "WORKSPACE_MEMBER_ALREADY_EXISTS",
  "WORKSPACE_MEMBER_ALREADY_ACTIVE",
  "WORKSPACE_MEMBER_ROLE_UNCHANGED",
  "WORKSPACE_MEMBER_ROLE_CONFLICT",
  "WORKSPACE_MEMBER_SELF_ROLE_CHANGE_DENIED",

  // --- customer -------------------------------------------------------------
  "CUSTOMER_NOT_FOUND",
  "CUSTOMER_NAME_REQUIRED",
  "CUSTOMER_VERSION_CONFLICT",
  /** Deactivating a customer who already is. Their balance is untouched either way. */
  "CUSTOMER_ALREADY_INACTIVE",
  "CUSTOMER_ALREADY_ACTIVE",

  // --- sale ------------------------------------------------------------------
  "SALE_NOT_FOUND",
  "SALE_EMPTY",
  "SALE_LINE_INVALID",
  /** Also covers editing or discarding a sale that has already been posted. */
  "SALE_ALREADY_POSTED",
  "SALE_VERSION_CONFLICT",
  "SALE_CURRENCY_MISMATCH",
  /** An update or delete was attempted against a posted sale (BR-SALE-008). */
  "SALE_IMMUTABLE",
  /** Editing or discarding a draft that was already discarded. */
  "SALE_ALREADY_DISCARDED",
  /** A posted sale must have exactly one ledger entry from its posting command. */
  "SALE_POSTING_ENTRY_MISSING",

  // --- sale correction --------------------------------------------------------
  /** Voiding a draft. A draft is discarded; there is no effect to compensate. */
  "SALE_NOT_POSTED",
  "SALE_ALREADY_VOIDED",
  "SALE_VOID_REASON_REQUIRED",
  /** A correction replacement must follow a committed void, never an active sale. */
  "SALE_REPLACEMENT_NOT_VOIDED",
  /** One voided sale has one correction successor at most. */
  "SALE_REPLACEMENT_ALREADY_EXISTS",
  /** The actor who voided the sale owns the continuation of that correction. */
  "SALE_REPLACEMENT_ACTOR_MISMATCH",
  /** A wrong-customer correction must actually move to a different customer. */
  "SALE_REPLACEMENT_CUSTOMER_UNCHANGED",
  "SALE_REPLACEMENT_CURRENCY_MISMATCH",

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
  "ACCOUNT_ADJUSTMENT_NOT_FOUND",
  "ACCOUNT_ADJUSTMENT_INTEGRITY_ERROR",
  "ACCOUNT_RECONCILIATION_INTEGRITY_FAILURE",
  "ACCOUNT_RECONCILIATION_REBUILD_UNSAFE",

  // --- command plumbing -----------------------------------------------------
  "DUPLICATE_COMMAND",
  "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
  "COMMAND_IN_PROGRESS",
  "INVALID_COMMAND_PAYLOAD",
  "TRANSACTION_TIME_IN_FUTURE",

  /**
   * A capability that this phase does not implement (for example sale
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
