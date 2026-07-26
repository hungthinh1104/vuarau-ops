import type { DomainError, DomainRejectionCode } from "@vuarau/domain-contracts";
import { domainErrorSchema } from "@vuarau/domain-contracts";

/**
 * Reading a business refusal off a transport error.
 *
 * Every rejection crossing the API boundary arrives as
 * `{ code, message, details, retryable }` on `error.data.domainError`
 * (docs/06-api-contracts/error-contract.md). This is the only place that shape is
 * unpacked, and it parses rather than casts: a server that changed the envelope
 * should produce `null` here and an honest "something went wrong", not a screen
 * reading fields that are not there.
 */
export function domainErrorOf(error: unknown): DomainError | null {
  if (typeof error !== "object" || error === null) return null;

  const data = (error as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;

  const parsed = domainErrorSchema.safeParse((data as { domainError?: unknown }).domainError);
  return parsed.success ? parsed.data : null;
}

/**
 * The state a screen should render, derived from the code and nothing else.
 *
 * Names come from docs/06-api-contracts/ui-state-catalog.md. Each is a different
 * *remedy*, which is why they are not one "error" state: a validation error sends
 * the user to a field, a business rejection to a different action, a permission
 * denial to a person, and a stale version to a reload.
 */
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

  /*
   * Everything else — including `DUPLICATE_COMMAND` and
   * `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`, which are client bugs, and
   * every unknown future code. A refusal nobody has written copy for is still a
   * refusal, and rendering it as a business rejection with its message beats
   * crashing on it (error-contract rule 4).
   */
  return "business_rejection";
}

/**
 * Whether a client may resubmit **on its own initiative**.
 *
 * Reads `retryable` from the server rather than deciding locally. Today only
 * `COMMAND_IN_PROGRESS` qualifies; a version conflict never does, because
 * retrying it would apply an intention formed against data this user never saw.
 */
export function isAutoRetryable(error: DomainError): boolean {
  return error.retryable;
}
