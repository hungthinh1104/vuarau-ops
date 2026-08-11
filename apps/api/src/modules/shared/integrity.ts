import type { DomainRejectionCode } from "@vuarau/domain-contracts";

/**
 * A persisted source fact is missing or inconsistent. This is not a user
 * validation error and it must not become an unhandled 500 with a database id
 * in the response. The command pipeline converts it into a controlled,
 * non-retryable rejection after the transaction rolls back.
 */
export type PersistedIntegrityCode = Extract<
  DomainRejectionCode,
  | "ACCOUNT_RECONCILIATION_INTEGRITY_FAILURE"
  | "CASH_RECONCILIATION_INTEGRITY_FAILURE"
  | "INVENTORY_RECONCILIATION_INTEGRITY_FAILURE"
  | "SUPPLIER_ACCOUNT_RECONCILIATION_INTEGRITY_FAILURE"
>;

export class CommandIntegrityError extends Error {
  readonly code: PersistedIntegrityCode;

  constructor(code: PersistedIntegrityCode, diagnostic: string) {
    super(diagnostic);
    this.name = "CommandIntegrityError";
    this.code = code;
  }
}
