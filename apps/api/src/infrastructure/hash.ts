import { createHash } from "node:crypto";

/**
 * Stable hash of a command payload, used to tell a genuine retry from a different
 * command reusing the same idempotency key (BR-COMMAND-002).
 *
 * Keys are sorted recursively before serialising: a client that emits its JSON
 * fields in a different order on the retry is still the same command, and
 * rejecting it would break the retry-safety the key exists to provide.
 */
export function hashPayload(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    // Array order is meaningful — order lines are not a set.
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(",")}}`;
}
