import type { DomainError, DomainRejectionCode } from "@vuanha/domain-contracts";
import { isRetryableCode } from "@vuanha/domain-contracts";

/**
 * Decision functions return refusals; they never throw.
 *
 * A thrown business rule can be swallowed by a `catch` three layers up and turn a
 * refusal into a success. A returned one has to be handled to compile.
 */
export type DomainResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: DomainError };

export function ok<T>(value: T): DomainResult<T> {
  return { ok: true, value };
}

export function err<T = never>(
  code: DomainRejectionCode,
  message: string,
  details?: Record<string, unknown>,
): DomainResult<T> {
  const error: DomainError =
    details === undefined
      ? { code, message, retryable: isRetryableCode(code) }
      : { code, message, details, retryable: isRetryableCode(code) };
  return { ok: false, error };
}

export function isOk<T>(result: DomainResult<T>): result is { ok: true; value: T } {
  return result.ok;
}
