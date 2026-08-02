"use client";

import { useCallback, useRef, useState } from "react";
import type {
  ActorId,
  CommandId,
  DomainError,
  IdempotencyKey,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import type { CommandIdentity, CommandPhase, PendingCommand } from "./command-identity.ts";
import {
  beginCommand,
  isUnknownOutcome,
  markRejected,
  markSucceeded,
  markUnknown,
  mintCommandIdentity,
  retryUnknown,
} from "./command-identity.ts";
import { domainErrorOf } from "./domain-error.ts";
import { useSession } from "./session-gate.tsx";

/**
 * The one place a command is sent, so that "what happens when it does not come
 * back" is answered once.
 *
 * Everything about this hook exists for the third of those cases:
 *
 *   the server said yes    → done
 *   the server said no     → a definite answer; nothing committed; keep the input
 *   nothing came back      → **the command may have committed**, and the client
 *                            cannot know
 *
 * The third is not an error state. Rendering it as one is how a worker taps
 * again, and a second tap with a fresh idempotency key is a second sale that no
 * server-side rule can prevent.
 */
export type CommandEnvelope<TPayload> = {
  readonly commandId: CommandId;
  readonly idempotencyKey: IdempotencyKey;
  readonly workspaceId: WorkspaceId;
  readonly actorId: ActorId;
  readonly occurredAt: string;
  readonly expectedVersion?: number;
  readonly payload: TPayload;
};

export type SubmitOptions = {
  /** Required by commands that change an aggregate somebody else may be viewing. */
  readonly expectedVersion?: number;
  /** When the business event happened. Defaults to now; back-dated on capture. */
  readonly occurredAt?: string;
};

export type CommandState<TPayload, TResult> = {
  readonly phase: CommandPhase;
  readonly pending: PendingCommand<TPayload> | null;
  readonly result: TResult | null;
  readonly error: DomainError | null;
  /**
   * True when the server answered a replay with the original result
   * (BR-COMMAND-001). A **success**, and rendered as one — showing an error here
   * trains people to submit again.
   */
  readonly wasDuplicateSafeRetry: boolean;
};

export type CommandRunner<TPayload, TResult> = CommandState<TPayload, TResult> & {
  /**
   * Starts a new intention: mints a fresh identity and sends it.
   *
   * Resolves with the server's result, or `null` if the command was refused,
   * dropped, or ignored because this runner has already settled. Returning the
   * value rather than only setting state is what lets a caller sequence two
   * commands — save the draft, then post it — without a render in between.
   */
  readonly submit: (payload: TPayload, options?: SubmitOptions) => Promise<TResult | null>;
  /** Resends the identical command. The identity does not change. */
  readonly resend: () => Promise<TResult | null>;
  readonly reset: () => void;
};

export function useCommand<TPayload, TResult>(
  send: (command: CommandEnvelope<TPayload>) => Promise<TResult>,
): CommandRunner<TPayload, TResult> {
  const { session, workspaceId } = useSession();
  const [state, setState] = useState<CommandState<TPayload, TResult>>({
    phase: { kind: "idle" },
    pending: null,
    result: null,
    error: null,
    wasDuplicateSafeRetry: false,
  });

  /*
   * A ref, not the state, because a double tap can fire two handlers before React
   * has re-rendered either of them. The ref is what makes the second tap reuse
   * the first tap's identity rather than mint a second one.
   *
   * The idempotency key is the real protection — the server dedupes either way —
   * but reusing the identity means the second request is recognisably a replay
   * rather than a race the server has to resolve.
   */
  const inFlight = useRef<PendingCommand<TPayload> | null>(null);
  const attemptOptions = useRef<SubmitOptions>({});

  /**
   * Set once the server has said yes, and never unset except by `reset()`.
   *
   * A ref rather than derived state for the same reason `inFlight` is one: the
   * tap that must be refused arrives before React has re-rendered the button
   * that would have been disabled.
   */
  const settled = useRef(false);

  /**
   * `dispatch` retries itself on the one retryable code, so it has to reach a
   * stable reference to itself. A ref rather than a `useCallback` cycle, which
   * TypeScript would reject and React would re-create on every render.
   */
  const dispatchRef = useRef<
    (command: PendingCommand<TPayload>, isReplay: boolean) => Promise<TResult | null>
  >(async () => null);

  const dispatch = useCallback(
    async (command: PendingCommand<TPayload>, isReplay: boolean): Promise<TResult | null> => {
      inFlight.current = command;
      setState((current) => ({ ...current, phase: command.phase, pending: command, error: null }));

      try {
        const result = await send({
          commandId: command.identity.commandId,
          idempotencyKey: command.identity.idempotencyKey,
          workspaceId: command.identity.workspaceId,
          actorId: command.identity.actorId,
          occurredAt: command.identity.occurredAt,
          ...(attemptOptions.current.expectedVersion !== undefined
            ? { expectedVersion: attemptOptions.current.expectedVersion }
            : {}),
          payload: command.payload,
        });

        const succeeded = markSucceeded(command);
        inFlight.current = null;
        settled.current = true;
        setState({
          phase: succeeded.phase,
          pending: succeeded,
          result,
          error: null,
          // A replay that succeeded returned the original result, not a new one.
          wasDuplicateSafeRetry: isReplay,
        });
        return result;
      } catch (error) {
        const domainError = domainErrorOf(error);

        if (domainError === null && isUnknownOutcome(error)) {
          // No answer. The command stays pending with its identity intact so a
          // resend is the *same* command, and the payload stays so nothing the
          // user typed is lost.
          const unknown = markUnknown(command);
          inFlight.current = unknown;
          setState((current) => ({ ...current, phase: unknown.phase, pending: unknown }));
          return null;
        }

        /*
         * `COMMAND_IN_PROGRESS` — the only retryable code in the catalogue.
         *
         * It means an identical command is still executing, which is exactly what
         * a double tap produces: the replay reaches the server while the first
         * attempt still holds the idempotency claim. The documented response is to
         * wait briefly and resubmit the **identical** command, which then returns
         * the original result (BR-COMMAND-001).
         *
         * Rendering it as a refusal instead — which is what happened before
         * TC-E2E-006 covered a same-tick double tap — leaves a worker looking at
         * "lệnh trước đang được xử lý" on a payment that in fact succeeded.
         *
         * Bounded, because a server that never finishes must not be waited on
         * forever; after that it surfaces as an ordinary rejection with a code the
         * user can act on.
         */
        if (domainError !== null && domainError.retryable && command.attempts < 4) {
          await new Promise((resolve) => setTimeout(resolve, 250 * command.attempts));
          return dispatchRef.current(retryUnknown(command), true);
        }

        // A definite refusal: nothing committed, and a refused command does not
        // consume its idempotency key. The payload is kept so the form still
        // holds what was typed.
        const rejected = markRejected(command);
        inFlight.current = null;
        setState((current) => ({
          ...current,
          phase: rejected.phase,
          pending: rejected,
          result: null,
          error: domainError,
        }));
        return null;
      }
    },
    [send],
  );

  dispatchRef.current = dispatch;

  const submit = useCallback(
    async (payload: TPayload, options: SubmitOptions = {}) => {
      /*
       * A tap after the command already succeeded is refused outright.
       *
       * Found by TC-E2E-006 rather than reasoned about: the command commits in
       * ~150 ms and the route change that follows does not, so a worker who taps
       * twice at a market hits a screen that has already succeeded and is still
       * showing the button. Before this guard the second tap was treated as a
       * fresh intention, minted a new key, and produced a **second payment**.
       *
       * The idempotency key cannot save this one. Two intentions with two keys
       * are indistinguishable from two genuine payments, which is exactly why the
       * client has to refuse rather than the server.
       *
       * A genuinely new payment starts with `reset()`, or with a new screen.
       */
      if (settled.current) return null;

      const current = inFlight.current;

      // A second tap while the first is still out, or before an unknown outcome
      // has been resolved, is the *same* intention. It reuses the identity.
      if (current !== null) {
        return dispatch(retryUnknown(current), true);
      }

      attemptOptions.current = options;
      const identity = mintCommandIdentity({
        workspaceId,
        actorId: session.actorId,
        ...(options.occurredAt !== undefined ? { occurredAt: options.occurredAt } : {}),
      });
      return dispatch(beginCommand(identity, payload), false);
    },
    [dispatch, session.actorId, workspaceId],
  );

  const resend = useCallback(async () => {
    const current = inFlight.current;
    if (current === null) return null;
    // `retryUnknown` returns the same identity object. There is no parameter here
    // by which a caller could vary it.
    return dispatch(retryUnknown(current), true);
  }, [dispatch]);

  const reset = useCallback(() => {
    inFlight.current = null;
    settled.current = false;
    attemptOptions.current = {};
    setState({
      phase: { kind: "idle" },
      pending: null,
      result: null,
      error: null,
      wasDuplicateSafeRetry: false,
    });
  }, []);

  return { ...state, submit, resend, reset };
}

/**
 * What a notice needs in order to render an outcome, without the payload type.
 *
 * `CommandRunner<TPayload, TResult>` satisfies it structurally for any payload,
 * so one `<CommandOutcome>` serves every command rather than being re-instantiated
 * per screen — which is what would let two screens disagree about whether an
 * unknown outcome is a failure.
 */
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
