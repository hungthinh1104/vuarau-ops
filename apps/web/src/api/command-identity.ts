import type { ActorId, CommandId, IdempotencyKey, WorkspaceId } from "@vuarau/domain-contracts";

/**
 * The identity a command keeps across every attempt at sending it.
 *
 * This is the smallest and most important piece of client state in the product.
 * When a request times out at a wholesale market at 3 a.m., the command **may
 * have committed** — the client cannot know, and must not guess. It resubmits
 * the identical command, which either returns the original result or completes
 * it (docs/06-api-contracts/ui-state-catalog.md §6).
 *
 * What must never happen is regenerating `idempotencyKey` on resubmit. That turns
 * one sale into two, and no server-side rule can prevent it, because a fresh key
 * is indistinguishable from a genuinely new command.
 *
 * So: identity is minted **once**, when the user commits to the action, and is
 * carried by the pending command until the server answers. It is not derived from
 * the attempt, and there is no function here that makes a new key for an existing
 * command.
 */
export type CommandIdentity = {
  readonly commandId: CommandId;
  readonly idempotencyKey: IdempotencyKey;
  readonly workspaceId: WorkspaceId;
  readonly actorId: ActorId;
  /** When the business event happened, per the device. Back-dated when offline. */
  readonly occurredAt: string;
};

/**
 * `crypto.randomUUID` is available in every browser this product targets and in
 * jsdom. It needs a secure context, which localhost and https both are.
 */
function uuid(): string {
  return globalThis.crypto.randomUUID();
}

export type MintCommandIdentity = {
  readonly workspaceId: WorkspaceId;
  readonly actorId: ActorId;
  /** Defaults to now. Passed explicitly when capturing something that already happened. */
  readonly occurredAt?: string;
};

export function mintCommandIdentity(input: MintCommandIdentity): CommandIdentity {
  return {
    commandId: uuid() as CommandId,
    idempotencyKey: uuid() as IdempotencyKey,
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };
}

/** What a pending command is doing, from the client's point of view. */
export type CommandPhase =
  | { readonly kind: "idle" }
  | { readonly kind: "sending" }
  | { readonly kind: "succeeded" }
  /** The server answered "no". A definite outcome — nothing is in flight. */
  | { readonly kind: "rejected" }
  /**
   * The request did not come back. **Not a failure.** The command may have
   * committed, and the only safe next move is resending this exact identity.
   */
  | { readonly kind: "unknown" };

export type PendingCommand<TPayload> = {
  readonly identity: CommandIdentity;
  readonly payload: TPayload;
  readonly phase: CommandPhase;
  readonly attempts: number;
};

export function beginCommand<TPayload>(
  identity: CommandIdentity,
  payload: TPayload,
): PendingCommand<TPayload> {
  return { identity, payload, phase: { kind: "sending" }, attempts: 1 };
}

/**
 * Prepares the next attempt at a command whose outcome is unknown.
 *
 * Note what it returns: the **same** `identity` object. There is deliberately no
 * parameter by which a caller could vary it, and the attempt counter is the only
 * thing that moves — so a UI can say "lần thử thứ 3" without that being a third
 * sale.
 */
export function retryUnknown<TPayload>(
  pending: PendingCommand<TPayload>,
): PendingCommand<TPayload> {
  return {
    identity: pending.identity,
    payload: pending.payload,
    phase: { kind: "sending" },
    attempts: pending.attempts + 1,
  };
}

export function markUnknown<TPayload>(pending: PendingCommand<TPayload>): PendingCommand<TPayload> {
  return { ...pending, phase: { kind: "unknown" } };
}

export function markSucceeded<TPayload>(
  pending: PendingCommand<TPayload>,
): PendingCommand<TPayload> {
  return { ...pending, phase: { kind: "succeeded" } };
}

export function markRejected<TPayload>(
  pending: PendingCommand<TPayload>,
): PendingCommand<TPayload> {
  return { ...pending, phase: { kind: "rejected" } };
}

/**
 * A network-level failure, as opposed to a business refusal.
 *
 * The distinction is the whole point: a refusal is a definite answer and the
 * command did not commit; a dropped connection is no answer at all. tRPC surfaces
 * the first with `data.domainError` and the second without any `data`.
 */
export function isUnknownOutcome(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return true;
  const data = (error as { data?: unknown }).data;
  return typeof data !== "object" || data === null;
}
