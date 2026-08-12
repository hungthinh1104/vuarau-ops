import { PersistedNumberOutOfRangeError } from "@vuarau/db";

const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function exactOperation(
  left: number,
  right: number,
  operation: "add" | "subtract",
  field: string,
): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
    throw new PersistedNumberOutOfRangeError(field);
  }
  const result = operation === "add" ? BigInt(left) + BigInt(right) : BigInt(left) - BigInt(right);
  if (result < MIN_SAFE_BIGINT || result > MAX_SAFE_BIGINT) {
    throw new PersistedNumberOutOfRangeError(field);
  }
  return Number(result);
}

export function exactAdd(left: number, right: number, field: string): number {
  return exactOperation(left, right, "add", field);
}

export function exactSubtract(left: number, right: number, field: string): number {
  return exactOperation(left, right, "subtract", field);
}
