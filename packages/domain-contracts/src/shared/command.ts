import { z } from "zod";
import { actorIdSchema, commandIdSchema, idempotencyKeySchema, workspaceIdSchema } from "./ids.ts";
import { transactionTimeSchema } from "./time.ts";

/**
 * Every write in this system is a named business command carrying this envelope.
 * There is no generic `update`. See ADR-0002 and docs/06-api-contracts/command-contracts.md.
 */
export const commandEnvelopeSchema = z.object({
  /** Identity of this attempt. Distinct per retry is fine; the key is what dedupes. */
  commandId: commandIdSchema,

  /** Retry token. Same key + same payload ⇒ same result, exactly once. */
  idempotencyKey: idempotencyKeySchema,

  /**
   * Aggregate version the caller believes it is modifying. Required by commands
   * that change existing aggregates; meaningless for creation commands.
   */
  expectedVersion: z.int().nonnegative().optional(),

  /** Tenant boundary. Every read and write is filtered by it. P0 isolation. */
  workspaceId: workspaceIdSchema,

  /** Who is accountable for this change. Recorded on every ledger and audit row. */
  actorId: actorIdSchema,

  /**
   * When the business event actually occurred — NOT when the request arrived.
   * Becomes `transactionTime` on ledger entries. Offline capture back-dates this.
   */
  occurredAt: transactionTimeSchema,
});
export type CommandEnvelope = z.infer<typeof commandEnvelopeSchema>;

/** Builds the full command schema for a payload. */
export function defineCommand<TPayload extends z.ZodType>(payload: TPayload) {
  return commandEnvelopeSchema.extend({ payload });
}

export type Command<TPayload> = CommandEnvelope & { payload: TPayload };

/** Commands that mutate an existing aggregate must state the version they saw. */
export const versionedCommandEnvelopeSchema = commandEnvelopeSchema.extend({
  expectedVersion: z.int().nonnegative(),
});

export function defineVersionedCommand<TPayload extends z.ZodType>(payload: TPayload) {
  return versionedCommandEnvelopeSchema.extend({ payload });
}

export type VersionedCommand<TPayload> = Command<TPayload> & { expectedVersion: number };
