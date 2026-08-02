import type { DomainError, DomainRejectionCode } from "@vuarau/domain-contracts";
import { domainErrorSchema } from "@vuarau/domain-contracts";

/**
 * Parse the domain-error envelope at the UI boundary.
 *
 * This module owns presentation-facing classification only. Transport adapters
 * may use the same contract, but visual patterns must not depend on the API
 * layer to decide which state to render.
 */
export function domainErrorOf(error: unknown): DomainError | null {
  if (typeof error !== "object" || error === null) return null;

  const data = (error as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;

  const parsed = domainErrorSchema.safeParse((data as { domainError?: unknown }).domainError);
  return parsed.success ? parsed.data : null;
}

export type RejectionState =
  | "validation_error"
  | "business_rejection"
  | "permission_denied"
  | "stale_version"
  | "command_in_progress"
  | "membership_revoked";

const VERSION_CONFLICTS: ReadonlySet<string> = new Set<DomainRejectionCode>([
  "SALE_VERSION_CONFLICT",
  "PAYMENT_VERSION_CONFLICT",
  "CUSTOMER_VERSION_CONFLICT",
]);

export function rejectionStateOf(code: DomainRejectionCode): RejectionState {
  if (code === "INVALID_COMMAND_PAYLOAD") return "validation_error";
  if (code === "PERMISSION_DENIED") return "permission_denied";
  if (code === "WORKSPACE_MEMBERSHIP_INACTIVE") return "membership_revoked";
  if (code === "COMMAND_IN_PROGRESS") return "command_in_progress";
  if (VERSION_CONFLICTS.has(code)) return "stale_version";
  return "business_rejection";
}

export function isAutoRetryable(error: DomainError): boolean {
  return error.retryable;
}
