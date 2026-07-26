import type { z } from "zod";
import type { CommandEnvelope, IsoInstant, Permission } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { err, ok } from "@vuarau/domain-kernel";
import type { Clock } from "../../infrastructure/clock.ts";
import type { AuthenticatedPrincipal } from "../../infrastructure/auth/principal.ts";
import type {
  Repositories,
  UnitOfWork,
  WorkspaceMembership,
} from "../../infrastructure/persistence/ports.ts";
import { hashPayload } from "../../infrastructure/hash.ts";
import { authorizeWorkspaceAccess } from "./authorization.ts";

/**
 * The eleven-step pipeline every state-changing command runs
 * (docs/06-api-contracts/command-contracts.md).
 *
 * Written once so that idempotency, authorization, time validation, transaction
 * boundaries and receipts cannot be forgotten by an individual handler — the most
 * likely way a P0 guarantee gets lost is one command that skipped a step.
 */

/** Server-scoped collaborators, built once at startup. */
export type CommandDeps = {
  readonly uow: UnitOfWork;
  readonly clock: Clock;
};

/**
 * Request-scoped: the server's collaborators plus the identity it established
 * from a verified token. Handlers take this, never a bare `CommandDeps`, so a
 * command cannot be executed without somebody accountable for it.
 */
export type CommandContext = {
  readonly deps: CommandDeps;
  readonly principal: AuthenticatedPrincipal;
};

export type CommandExecution<TCommand, TResult> = (args: {
  readonly command: TCommand;
  readonly repos: Repositories;
  readonly recordedAt: IsoInstant;
  /** The caller's membership, already verified to carry the permission. */
  readonly membership: WorkspaceMembership;
}) => Promise<DomainResult<TResult>>;

/** Devices in the field have unreliable clocks; the past is fine, the future is not. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Carries a domain refusal out through the transaction boundary so the database
 * rolls back. A refused command must leave nothing behind — including its
 * idempotency claim, so the user can fix the payload and reuse the same key.
 */
class RollbackForRejection extends Error {
  /**
   * An explicit field, not a `constructor(readonly …)` parameter property.
   *
   * Node executes this repository's TypeScript by **stripping types**, not by
   * compiling it, and a parameter property is one of the few constructs that
   * emits code rather than only removing it. Vitest's esbuild transform accepted
   * it, so the whole test suite passed while `node src/server.ts` — the documented
   * way to run the API — crashed on import.
   */
  readonly rejection: Extract<DomainResult<never>, { ok: false }>;

  constructor(rejection: Extract<DomainResult<never>, { ok: false }>) {
    super("Command rejected; rolling back.");
    this.name = "RollbackForRejection";
    this.rejection = rejection;
  }
}

export async function runCommand<
  TCommand extends CommandEnvelope & { payload: unknown },
  TResult,
>(options: {
  readonly commandType: string;
  readonly schema: z.ZodType<TCommand>;
  readonly input: unknown;
  readonly ctx: CommandContext;
  /** What the caller's role must carry for this command (BR-AUTH-004). */
  readonly requiredPermission: Permission;
  readonly execute: CommandExecution<TCommand, TResult>;
}): Promise<DomainResult<TResult>> {
  const { commandType, schema, input, ctx, requiredPermission, execute } = options;
  const { deps, principal } = ctx;

  // 1. Validate the payload shape.
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return err("INVALID_COMMAND_PAYLOAD", "The command payload is not valid.", {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  const command = parsed.data;

  // 2. Read the clock exactly once. Every row this command writes shares it.
  const recordedAt = deps.clock.now();

  // 3. Reject a business time from the future (BR-COMMAND-004).
  const skew = Date.parse(command.occurredAt) - Date.parse(recordedAt);
  if (skew > FUTURE_TOLERANCE_MS) {
    return err("TRANSACTION_TIME_IN_FUTURE", "The transaction time is in the future.", {
      occurredAt: command.occurredAt,
      serverTime: recordedAt,
    });
  }

  const payloadHash = hashPayload(command.payload);

  try {
    return await deps.uow.transaction(async (repos) => {
      // 4. Identity, membership, and permission — before any business data is
      //    read, and before the idempotency key is claimed, so an unauthorized
      //    caller cannot burn somebody else's key.
      const authorized = await authorizeWorkspaceAccess({
        repos,
        principal,
        workspaceId: command.workspaceId,
        permission: requiredPermission,
        claimedActorId: command.actorId,
      });
      if (!authorized.ok) {
        throw new RollbackForRejection(authorized);
      }

      // 5. Idempotency (ADR-0008).
      const replay = await checkIdempotency<TResult>({
        repos,
        command,
        commandType,
        payloadHash,
      });
      if (replay !== null) {
        return replay;
      }

      // 6. Claim the key. The unique index — not the read above — is what makes
      //    two concurrent replays safe; the loser lands here.
      const claimed = await repos.receipts.claim({
        commandId: command.commandId,
        workspaceId: command.workspaceId,
        idempotencyKey: command.idempotencyKey,
        commandType,
        payloadHash,
        status: "in_progress",
        result: null,
        recordedAt,
      });
      if (!claimed) {
        throw new RollbackForRejection(
          asRejection(
            err("COMMAND_IN_PROGRESS", "An identical command is already being processed.", {
              idempotencyKey: command.idempotencyKey,
            }),
          ),
        );
      }

      // 7–10. Load, decide, persist — inside this same transaction.
      const result = await execute({
        command,
        repos,
        recordedAt,
        membership: authorized.value,
      });
      if (!result.ok) {
        throw new RollbackForRejection(result);
      }

      // 11. Store the result so a retry gets the answer, not "already done".
      await repos.receipts.complete(command.workspaceId, command.idempotencyKey, result.value);
      return result;
    });
  } catch (error) {
    if (error instanceof RollbackForRejection) {
      return error.rejection as DomainResult<TResult>;
    }
    throw error;
  }
}

async function checkIdempotency<TResult>(args: {
  repos: Repositories;
  command: CommandEnvelope;
  commandType: string;
  payloadHash: string;
}): Promise<DomainResult<TResult> | null> {
  const { repos, command, payloadHash } = args;

  const existing = await repos.receipts.find(command.workspaceId, command.idempotencyKey);
  if (existing === null) {
    // The same commandId under a different key means the client reused an id it
    // should not have — a different bug from a retry, and worth its own code.
    const byCommandId = await repos.receipts.findByCommandId(
      command.workspaceId,
      command.commandId,
    );
    if (byCommandId !== null && byCommandId.idempotencyKey !== command.idempotencyKey) {
      throw new RollbackForRejection(
        asRejection(
          err("DUPLICATE_COMMAND", "This command id has already been used with a different key.", {
            commandId: command.commandId,
          }),
        ),
      );
    }
    return null;
  }

  if (existing.payloadHash !== payloadHash) {
    throw new RollbackForRejection(
      asRejection(
        err(
          "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
          "This idempotency key was already used for a different command.",
          { idempotencyKey: command.idempotencyKey },
        ),
      ),
    );
  }

  if (existing.status === "in_progress") {
    throw new RollbackForRejection(
      asRejection(
        err("COMMAND_IN_PROGRESS", "An identical command is already being processed.", {
          idempotencyKey: command.idempotencyKey,
        }),
      ),
    );
  }

  // BR-COMMAND-001 — the original answer, replayed verbatim. The stored result was
  // produced by this same command type, so the cast restores what was serialised.
  return ok(existing.result as TResult);
}

function asRejection(result: DomainResult<never>): Extract<DomainResult<never>, { ok: false }> {
  if (result.ok) {
    throw new Error("asRejection called with a successful result.");
  }
  return result;
}
