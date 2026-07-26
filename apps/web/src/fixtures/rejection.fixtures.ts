import type { DomainError } from "@vuarau/domain-contracts";
import { POSTED_SALE_ID, VOIDED_SALE_ID } from "@vuarau/test-fixtures/ids";

/**
 * Stable rejection fixtures — one per state the UI must be able to render.
 *
 * Each carries a real `details` payload, because that is what separates a usable
 * message from a shrug: `PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT` without
 * `remaining` cannot say how much *can* be reversed, and the client is forbidden
 * from parsing the prose to find out.
 *
 * `message` is English on purpose. It is what the server sends today, and every
 * component here renders copy keyed by `code` instead — a story with a Vietnamese
 * `message` would hide a component that was reading the wrong field.
 */

export const rejectionSaleEmpty: DomainError = {
  code: "SALE_EMPTY",
  message: "A sale must have at least one line before it can be posted.",
  details: { saleId: POSTED_SALE_ID },
  retryable: false,
};

export const rejectionSaleAlreadyVoided: DomainError = {
  code: "SALE_ALREADY_VOIDED",
  message: "This sale has already been voided.",
  details: { saleId: VOIDED_SALE_ID },
  retryable: false,
};

export const rejectionReversalExceeds: DomainError = {
  code: "PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT",
  message: "Cannot reverse 400000 VND: only 300000 VND remains reversible.",
  details: { requested: 400_000, remaining: 300_000, currency: "VND" },
  retryable: false,
};

export const rejectionPermissionDenied: DomainError = {
  code: "PERMISSION_DENIED",
  message: "Role 'sales' does not carry permission 'sale.void'.",
  details: { permission: "sale.void", role: "sales" },
  retryable: false,
};

/** Not retryable, and the details are what the reload screen shows. */
export const rejectionStaleVersion: DomainError = {
  code: "SALE_VERSION_CONFLICT",
  message: "Sale was modified by someone else.",
  details: { saleId: POSTED_SALE_ID, expectedVersion: 1, actualVersion: 2 },
  retryable: false,
};

/** The **only** retryable code in the catalogue. */
export const rejectionCommandInProgress: DomainError = {
  code: "COMMAND_IN_PROGRESS",
  message: "An identical command is still executing.",
  details: { idempotencyKey: "sale-post-2026-07-20-0001" },
  retryable: true,
};

export const rejectionValidation: DomainError = {
  code: "INVALID_COMMAND_PAYLOAD",
  message: "Payload failed schema validation.",
  details: { issues: [{ path: ["payload", "amount", "amountMinor"], message: "Expected int" }] },
  retryable: false,
};

/** Arrives on **any** call, not only at sign-in: membership is re-read every request. */
export const rejectionMembershipRevoked: DomainError = {
  code: "WORKSPACE_MEMBERSHIP_INACTIVE",
  message: "This membership has been deactivated.",
  details: { workspaceId: "…", actorId: "…" },
  retryable: false,
};

export const rejectionLastOwner: DomainError = {
  code: "WORKSPACE_LAST_OWNER",
  message: "Cannot revoke the only remaining active owner.",
  details: { activeOwnerCount: 1 },
  retryable: false,
};

export const rejectionCustomerAlreadyInactive: DomainError = {
  code: "CUSTOMER_ALREADY_INACTIVE",
  message: "This customer is already inactive.",
  details: {},
  retryable: false,
};

export const allRejections: readonly DomainError[] = [
  rejectionSaleEmpty,
  rejectionSaleAlreadyVoided,
  rejectionReversalExceeds,
  rejectionPermissionDenied,
  rejectionStaleVersion,
  rejectionCommandInProgress,
  rejectionValidation,
  rejectionMembershipRevoked,
  rejectionLastOwner,
  rejectionCustomerAlreadyInactive,
];
