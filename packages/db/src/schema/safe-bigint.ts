import { customType } from "drizzle-orm/pg-core";
import { PersistedNumberOutOfRangeError } from "../errors.ts";

const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

export function persistedBigintToSafeNumber(value: unknown, field: string): number {
  let parsed: bigint;
  try {
    if (typeof value !== "bigint" && typeof value !== "number" && typeof value !== "string") {
      throw new TypeError("Persisted integer is not numeric.");
    }
    parsed = typeof value === "bigint" ? value : BigInt(value);
  } catch {
    throw new PersistedNumberOutOfRangeError(field);
  }

  if (parsed < MIN_SAFE_BIGINT || parsed > MAX_SAFE_BIGINT) {
    throw new PersistedNumberOutOfRangeError(field);
  }
  return Number(parsed);
}

const safeBigintType = customType<{
  data: number;
  driverData: bigint | number | string;
}>({
  dataType: () => "bigint",
  fromDriver: (value) => persistedBigintToSafeNumber(value, "persisted bigint"),
  toDriver: (value) => BigInt(persistedBigintToSafeNumber(value, "write bigint")),
});

/** Drop-in replacement for Drizzle bigint(..., { mode: "number" }). */
export function safeBigint(databaseName: string, _config?: { readonly mode?: "number" }) {
  return safeBigintType(databaseName);
}
