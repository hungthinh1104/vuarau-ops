import type {
  ActorId,
  CommandId,
  DomainError,
  IdempotencyKey,
  WorkspaceId,
} from "@vuarau/domain-contracts";

/** Presentation contract for command feedback. No transport or hook dependency. */
export type CommandIdentity = {
  readonly commandId: CommandId;
  readonly idempotencyKey: IdempotencyKey;
  readonly workspaceId: WorkspaceId;
  readonly actorId: ActorId;
  readonly occurredAt: string;
};

export type CommandPhase =
  | { readonly kind: "idle" }
  | { readonly kind: "sending" }
  | { readonly kind: "succeeded" }
  | { readonly kind: "rejected" }
  | { readonly kind: "unknown" };

export type CommandOutcomeView = {
  readonly phase: CommandPhase;
  readonly pending: {
    readonly identity: CommandIdentity;
    readonly attempts: number;
  } | null;
  readonly error: DomainError | null;
  readonly wasDuplicateSafeRetry: boolean;
  readonly resend: () => Promise<unknown>;
};
