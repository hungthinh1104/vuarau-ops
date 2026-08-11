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
export class PersistedIntegrityError extends Error {
  readonly code = "INVENTORY_RECONCILIATION_INTEGRITY_FAILURE" as const;

  constructor(diagnostic: string) {
    super(diagnostic);
    this.name = "PersistedIntegrityError";
  }
}
