import { createHash } from "node:crypto";

/**
 * A stable v4-shaped uuid derived from text. Same input, same id, every run.
 *
 * Operator tools need this for the same reason offline clients do: a command
 * carries the id of the thing it creates, so a re-run after a crash is a
 * **replay** only if the id comes out the same. A fresh uuid under the same
 * idempotency key is a payload mismatch — a rejection, not a replay
 * (BR-COMMAND-001).
 */
export function deterministicUuid(namespace: string, name: string): string {
  const digest = createHash("sha256").update(`${namespace} ${name}`).digest();
  const bytes = Uint8Array.prototype.slice.call(digest, 0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
