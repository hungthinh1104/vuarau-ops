import type { CommandEnvelope, IdempotencyKey } from "@vuanha/domain-contracts";
import {
  ACTOR_ID,
  COMMAND_ID,
  IDEMPOTENCY_KEY,
  SECOND_COMMAND_ID,
  WORKSPACE_ID,
} from "./ids.fixtures.ts";
import { TRANSACTION_TIME } from "./time.fixtures.ts";

/**
 * Command envelopes for the three situations that behave differently:
 * a first attempt, a network retry, and a genuinely new command.
 */

/** The original attempt. */
export const baseEnvelope: CommandEnvelope = {
  commandId: COMMAND_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: TRANSACTION_TIME,
};

/**
 * A client retry after a lost response: **new** `commandId`, **same**
 * `idempotencyKey`. This is the shape that must return the original result
 * (BR-COMMAND-001) — the key is what dedupes, not the command id.
 */
export const retryEnvelope: CommandEnvelope = {
  ...baseEnvelope,
  commandId: SECOND_COMMAND_ID,
};

/** A genuinely different command: new id, new key. */
export function freshEnvelope(
  commandId: CommandEnvelope["commandId"],
  idempotencyKey: string,
): CommandEnvelope {
  return { ...baseEnvelope, commandId, idempotencyKey: idempotencyKey as IdempotencyKey };
}

export function withVersion(
  envelope: CommandEnvelope,
  expectedVersion: number,
): CommandEnvelope & {
  expectedVersion: number;
} {
  return { ...envelope, expectedVersion };
}
