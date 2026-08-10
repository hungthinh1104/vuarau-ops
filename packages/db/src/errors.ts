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
