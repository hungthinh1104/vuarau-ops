import { z } from "zod";
import { domainRejectionCodeSchema } from "./rejection-codes.ts";

/**
 * A server-computed answer to "may this actor do this thing to this aggregate,
 * right now?".
 *
 * Capabilities exist so the UI can disable a button for the same reason the
 * server would refuse it — one source of truth, one wording, no drift. They are
 * a rendering hint and nothing else: the command handler re-evaluates every rule
 * from scratch. See docs/06-api-contracts/capabilities.md and ADR-0003.
 */
export const capabilitySchema = z.object({
  allowed: z.boolean(),
  /** Present iff `allowed` is false. Same code the command would have returned. */
  reasonCode: domainRejectionCodeSchema.optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type Capability = z.infer<typeof capabilitySchema>;

export const ALLOWED: Capability = { allowed: true };

export function denied(
  reasonCode: z.infer<typeof domainRejectionCodeSchema>,
  details?: Record<string, unknown>,
): Capability {
  return details === undefined
    ? { allowed: false, reasonCode }
    : { allowed: false, reasonCode, details };
}
