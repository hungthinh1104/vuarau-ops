/** A persisted integer cannot be represented exactly as a JavaScript number. */
export class PersistedNumberOutOfRangeError extends Error {
  readonly code = "PERSISTED_NUMBER_OUT_OF_RANGE" as const;
  readonly field: string;

  constructor(field: string) {
    super(`Persisted integer for ${field} is outside the safe JavaScript range.`);
    this.name = "PersistedNumberOutOfRangeError";
    this.field = field;
  }
}

/** A persisted aggregate cannot be reduced without inventing a quantity. */
export type PersistedIntegrityCode =
  | "ACCOUNT_RECONCILIATION_INTEGRITY_FAILURE"
  | "CASH_RECONCILIATION_INTEGRITY_FAILURE"
  | "INVENTORY_RECONCILIATION_INTEGRITY_FAILURE"
  | "SUPPLIER_ACCOUNT_RECONCILIATION_INTEGRITY_FAILURE";

export class PersistedIntegrityError extends Error {
  readonly code: PersistedIntegrityCode;

  constructor(
    diagnostic: string,
    code: PersistedIntegrityCode = "INVENTORY_RECONCILIATION_INTEGRITY_FAILURE",
  ) {
    super(diagnostic);
    this.name = "PersistedIntegrityError";
    this.code = code;
  }
}

/** A client reused a persisted payment identity for a new command. */
export class PaymentIdentityConflictError extends Error {
  readonly code = "PAYMENT_ALREADY_EXISTS" as const;

  constructor(paymentId: string) {
    super(`Payment ${paymentId} already exists.`);
    this.name = "PaymentIdentityConflictError";
  }
}

export function isUniqueConstraintViolation(error: unknown, constraint: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    readonly code?: unknown;
    readonly constraint?: unknown;
    readonly constraint_name?: unknown;
    readonly cause?: unknown;
  };
  if (
    candidate.code === "23505" &&
    (candidate.constraint === constraint || candidate.constraint_name === constraint)
  ) {
    return true;
  }
  return candidate.cause !== error && isUniqueConstraintViolation(candidate.cause, constraint);
}
