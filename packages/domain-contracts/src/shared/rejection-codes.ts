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
  "BACKUP_DIGEST_INVALID",
  "BACKUP_UNSAFE_TARGET",
  "BACKUP_INTEGRITY_ERROR",

  // --- customer -------------------------------------------------------------
  "CUSTOMER_NOT_FOUND",
  "CUSTOMER_NAME_REQUIRED",
  "CUSTOMER_VERSION_CONFLICT",
  /** Deactivating a customer who already is. Their balance is untouched either way. */
  "CUSTOMER_ALREADY_INACTIVE",
  "CUSTOMER_ALREADY_ACTIVE",

  // --- product --------------------------------------------------------------
  "PRODUCT_NOT_FOUND",
  "PRODUCT_VERSION_CONFLICT",
  "QUALITY_GRADE_NOT_FOUND",
  "QUALITY_GRADE_INACTIVE",
  "QUALITY_GRADE_VERSION_CONFLICT",

  // --- supplier -------------------------------------------------------------
  "SUPPLIER_NOT_FOUND",
  "SUPPLIER_INACTIVE",
  "SUPPLIER_VERSION_CONFLICT",
  "SUPPLIER_PAYMENT_AMOUNT_INVALID",
  "SUPPLIER_PAYMENT_NOT_FOUND",
  "SUPPLIER_PAYMENT_ALREADY_REVERSED",
  "SUPPLIER_PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT",
  "SUPPLIER_PAYMENT_REVERSAL_REASON_REQUIRED",
  "SUPPLIER_ACCOUNT_ADJUSTMENT_REASON_REQUIRED",
  "SUPPLIER_ACCOUNT_ADJUSTMENT_AMOUNT_INVALID",
  "SUPPLIER_ACCOUNT_RECONCILIATION_INTEGRITY_FAILURE",
  "SUPPLIER_ACCOUNT_RECONCILIATION_REBUILD_UNSAFE",

  // --- purchase / receiving / inventory ------------------------------------
  "PURCHASE_NOT_FOUND",
  "PURCHASE_EMPTY",
  "PURCHASE_LINE_INVALID",
  "PURCHASE_VERSION_CONFLICT",
  "PURCHASE_ALREADY_CONFIRMED",
  "PURCHASE_ALREADY_DISCARDED",
  "PURCHASE_ALREADY_VOIDED",
  "PURCHASE_NOT_CONFIRMED",
  "PURCHASE_REPLACEMENT_INVALID",
  "PURCHASE_HAS_ACTIVE_RECEIPTS",
  "PURCHASE_VOID_REASON_REQUIRED",
  "RECEIPT_NOT_FOUND",
  "RECEIPT_ALREADY_REVERSED",
  "RECEIPT_QUANTITY_EXCEEDS_PURCHASE",
  "RECEIPT_UNIT_MISMATCH",
  "RECEIPT_REVERSAL_REASON_REQUIRED",
  "INVENTORY_ADJUSTMENT_REASON_REQUIRED",
  "INVENTORY_RECLASSIFICATION_INVALID",
  "INVENTORY_RECLASSIFICATION_REASON_REQUIRED",
  "INVENTORY_RECONCILIATION_INTEGRITY_FAILURE",
  "DELIVERY_NOT_FOUND",
  "DELIVERY_LINE_INVALID",
  "DELIVERY_VERSION_CONFLICT",
  "DELIVERY_ALREADY_DISPATCHED",
  "DELIVERY_ALREADY_CANCELLED",
  "DELIVERY_ALREADY_DELIVERED",
  "DELIVERY_QUANTITY_EXCEEDS_SALE",
  "DELIVERY_RETURN_EXCEEDS_DISPATCH",
  "DELIVERY_PRODUCT_REQUIRED",
  "DELIVERY_REPLACEMENT_FULFILMENT_BLOCKED",
  "DELIVERY_REASON_REQUIRED",
  "DOCUMENT_NOT_FOUND",
  "DOCUMENT_SOURCE_INVALID",
  "DOCUMENT_SHARE_NOT_FOUND",
  "DOCUMENT_SHARE_REVOKED",
  "DOCUMENT_SHARE_EXPIRED",
  "REPORT_INTEGRITY_FAILURE",

  // --- sale ------------------------------------------------------------------
  "SALE_NOT_FOUND",
  "SALE_EMPTY",
  "SALE_LINE_INVALID",
  /** A draft line may be unresolved while typing; posting never may be. */
  "SALE_PRODUCT_REQUIRED",
  /** The referenced catalogue product is absent from the command workspace. */
  "SALE_PRODUCT_NOT_FOUND",
  /** An inactive catalogue product cannot become new posted goods truth. */
  "SALE_PRODUCT_INACTIVE",
  /** Draft snapshot name/unit no longer agrees with the referenced Product. */
  "SALE_PRODUCT_SNAPSHOT_MISMATCH",
  "SALE_QUALITY_GRADE_REQUIRED",
  "SALE_QUALITY_GRADE_NOT_FOUND",
  "SALE_QUALITY_GRADE_INACTIVE",
  "SALE_QUALITY_GRADE_SNAPSHOT_MISMATCH",
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
