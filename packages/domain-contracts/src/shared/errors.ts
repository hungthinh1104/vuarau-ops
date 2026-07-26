import { z } from "zod";
import { domainRejectionCodeSchema } from "./rejection-codes.ts";

/**
 * The single error shape crossing the API boundary.
 * See docs/06-api-contracts/error-contract.md.
 */
export const domainErrorSchema = z.object({
  code: domainRejectionCodeSchema,
  /** Human-readable, English today, Vietnamese later. Never branch on this. */
  message: z.string().min(1),
  /** Machine-readable context: which line index, which remaining amount. */
  details: z.record(z.string(), z.unknown()).optional(),
  retryable: z.boolean(),
});
export type DomainError = z.infer<typeof domainErrorSchema>;
