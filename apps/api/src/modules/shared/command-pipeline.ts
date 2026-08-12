import type { z } from "zod";
import type {
  CommandEnvelope,
  DashboardEvent,
  IsoInstant,
  Permission,
  WorkspaceOperationalProfileDto,
  WorkspaceWorkflow,
} from "@vuarau/domain-contracts";
import {
  defaultWorkspaceOperationalProfile,
  vietnamBusinessDateForInstant,
  workspaceWorkflowEnabled,
} from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import {
  ExactIntegerArithmeticError,
  ExactMoneyArithmeticError,
  err,
  ok,
} from "@vuarau/domain-kernel";
import {
  PaymentIdentityConflictError,
  PersistedIntegrityError,
  PersistedNumberOutOfRangeError,
} from "@vuarau/db";
import type { Clock } from "../../infrastructure/clock.ts";
import type { AuthenticatedPrincipal } from "../../infrastructure/auth/principal.ts";
import type {
  Repositories,
  UnitOfWork,
  WorkspaceMembership,
} from "../../infrastructure/persistence/ports.ts";
import type { CommandCompletion } from "../../infrastructure/persistence/ports.ts";
import { hashPayload } from "../../infrastructure/hash.ts";
import { currentRequestId, log } from "../../infrastructure/logging.ts";
import { authorizeWorkspaceAccess } from "./authorization.ts";
import { topicsForCommand } from "./change-topics.ts";
import { CommandIntegrityError } from "./integrity.ts";

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
  /** Optional post-commit invalidation signal; canonical facts remain in PostgreSQL. */
  readonly publishInvalidation?: (event: DashboardEvent) => Promise<void>;
  /** Present only for a shadow-pilot server; absent in development and production. */
  readonly pilotScope?: {
    readonly isCommandExcluded: (commandType: string) => boolean;
  };
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
  /** Effective depot operating policy, loaded inside the command transaction. */
  readonly operationalProfile: WorkspaceOperationalProfileDto;
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
  /** Every listed workflow must be enabled for a new command to execute. */
  readonly requiredWorkflows?: readonly WorkspaceWorkflow[];
  /** Administrative commands may still manage access/profile after a close. */
  readonly businessDayPolicy?: "enforce" | "bypass";
  /** Normal commands use a shared profile lock; profile transitions use exclusive. */
  readonly profileLock?: "shared" | "exclusive" | "none";
  /** Membership administration locks the owner set first, then rechecks auth. */
  readonly lockAuthorizationMembership?: boolean;
  /** Current response contract used to validate a completed receipt on replay. */
  readonly resultSchema: z.ZodType<TResult>;
  /** Optional safe representation persisted in the idempotency receipt. */
  readonly receiptResult?: (result: TResult) => unknown;
  /** Schema for the safe representation persisted in the receipt. */
  readonly receiptSchema?: z.ZodType | undefined;
  /** Optional replay policy for results that contain one-time secrets. */
  readonly replayReceipt?: ((result: unknown) => DomainResult<TResult>) | undefined;
  readonly execute: CommandExecution<TCommand, TResult>;
}): Promise<DomainResult<TResult>> {
  const {
    commandType,
    schema,
    input,
    ctx,
    requiredPermission,
    requiredWorkflows = [],
    businessDayPolicy = "enforce",
    profileLock = "shared",
    lockAuthorizationMembership = true,
    execute,
  } = options;
  const { deps, principal } = ctx;
  const startedAt = Date.now();

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

  /*
   * One line per command, carrying only identifiers, an outcome and a duration
   * (BR-OPS-001). Not the payload, not the amount, not who the customer is —
   * `commandId` is enough to find the audit record, which is where the business
   * detail belongs and is access-controlled.
   */
  const record = (outcome: "accepted" | "rejected" | "replayed", code: string | null): void => {
    log({
      event: "command",
      requestId: currentRequestId(),
      commandId: command.commandId,
      commandType,
      workspaceId: command.workspaceId,
      actorId: command.actorId,
      outcome,
      code,
      durationMs: Date.now() - startedAt,
    });
  };

  let accepted = false;
  let completedOutcome: "accepted" | "replayed" | null = null;
  let completion: CommandCompletion | null = null;
  try {
    const result = await deps.uow.transaction(async (repos) => {
      // 4. Identity, membership, and permission — before any business data is
      //    read, and before the idempotency key is claimed, so an unauthorized
      //    caller cannot burn somebody else's key.
      const authorized = await authorizeWorkspaceAccess({
        repos,
        principal,
        workspaceId: command.workspaceId,
        permission: requiredPermission,
        claimedActorId: command.actorId,
        lockMembership: lockAuthorizationMembership,
      });
      if (!authorized.ok) {
        throw new RollbackForRejection(authorized);
      }

      // A completed receipt is a durable answer to a previously committed
      // command. It must be checked before mutable gates such as workflow
      // enablement, profile changes, close state and pilot scope. Authorization
      // remains first so a revoked actor cannot use a valid key to read a result.
      const replay = await checkIdempotency<TResult>({
        repos,
        command,
        commandType,
        payloadHash,
        resultSchema: options.resultSchema,
        receiptSchema: options.receiptSchema,
        replayReceipt: options.replayReceipt,
      });
      if (replay !== null) {
        completedOutcome = "replayed";
        return replay;
      }

      if (profileLock === "shared") {
        await repos.workspaces.lockOperationalProfileShared(command.workspaceId);
      } else if (profileLock === "exclusive") {
        await repos.workspaces.lockOperationalProfileExclusive(command.workspaceId);
      }
      const operationalProfile =
        (await (profileLock === "exclusive"
          ? repos.workspaces.findOperationalProfileForUpdate(command.workspaceId)
          : repos.workspaces.findOperationalProfile(command.workspaceId))) ??
        defaultWorkspaceOperationalProfile(command.workspaceId);
      const disabledWorkflow = requiredWorkflows.find(
        (workflow) => !workspaceWorkflowEnabled(operationalProfile, workflow),
      );
      if (disabledWorkflow !== undefined) {
        throw new RollbackForRejection(
          asRejection(
            err("WORKSPACE_WORKFLOW_DISABLED", "This workflow is disabled for the current depot.", {
              workflow: disabledWorkflow,
            }),
          ),
        );
      }

      if (businessDayPolicy === "enforce") {
        const businessDate = vietnamBusinessDateForInstant(
          command.occurredAt,
          operationalProfile.businessDayStartMinute,
        );
        // Closing a business date takes the same transaction-scoped lock. This
        // makes the check and the subsequent mutation one serialized decision;
        // a command cannot pass the read and then commit after a concurrent
        // close has completed.
        await repos.operationalCloses.lockBusinessDateShared(command.workspaceId, businessDate);
        const close = await repos.operationalCloses.findByBusinessDate(
          command.workspaceId,
          businessDate,
        );
        if (close?.state === "closed") {
          throw new RollbackForRejection(
            asRejection(
              err(
                "OPERATIONAL_DAY_CLOSED",
                "The business day is closed; reopen it before recording a backdated change.",
                { businessDate },
              ),
            ),
          );
        }
      }

      if (deps.pilotScope?.isCommandExcluded(commandType) === true) {
        throw new RollbackForRejection(
          asRejection(
            err("PILOT_SCOPE_EXCLUDED", "This command is outside the current shadow-pilot scope.", {
              commandType,
              requestId: currentRequestId(),
            }),
          ),
        );
      }

      // Claim the key. The unique index — not the read above — is what makes
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
        operationalProfile,
      });
      if (!result.ok) {
        throw new RollbackForRejection(result);
      }

      // 11. Store the result so a retry gets the answer, not "already done".
      completion = await repos.receipts.complete(
        command.workspaceId,
        command.idempotencyKey,
        options.receiptResult === undefined ? result.value : options.receiptResult(result.value),
        { topics: topicsForCommand(commandType) },
      );
      accepted = true;
      completedOutcome = "accepted";
      return result;
    });
    // This is deliberately outside the transaction callback. If the database
    // rejects the commit, execution never reaches here and no success event can
    // claim that a result was persisted.
    if (result.ok && completedOutcome !== null) record(completedOutcome, null);
    if (accepted && result.ok && deps.publishInvalidation !== undefined) {
      const payload = command.payload;
      const candidateEntityId =
        typeof payload === "object" && payload !== null
          ? Object.entries(payload as Record<string, unknown>).find(
              ([name, value]) =>
                typeof value === "string" && (name === "id" || name.endsWith("Id")),
            )?.[1]
          : undefined;
      const entityId = typeof candidateEntityId === "string" ? candidateEntityId : null;
      const completionForEvent = completion as CommandCompletion | null;
      try {
        await deps.publishInvalidation({
          workspaceId: command.workspaceId,
          entityType: commandType,
          entityId,
          occurredAt: recordedAt,
          revision: completionForEvent === null ? undefined : completionForEvent.revision,
          topics: completionForEvent === null ? undefined : [...completionForEvent.topics],
        });
      } catch {
        log({
          event: "exception",
          requestId: currentRequestId(),
          procedure: commandType,
          code: "DASHBOARD_INVALIDATION_FAILED",
        });
      }
    }
    return result;
  } catch (error) {
    if (error instanceof RollbackForRejection) {
      const rejection = error.rejection as DomainResult<TResult>;
      // Logged after the rollback, so nothing claims to have happened that did
      // not. The code is from the closed rejection set; the message is not logged.
      record("rejected", rejection.ok ? null : rejection.error.code);
      return rejection;
    }
    if (
      error instanceof PersistedNumberOutOfRangeError ||
      error instanceof ExactMoneyArithmeticError ||
      error instanceof ExactIntegerArithmeticError
    ) {
      const rejection = err(
        "PERSISTED_NUMBER_OUT_OF_RANGE",
        "Persisted numeric data is outside the supported range.",
        {
          field: error.field,
          requestId: currentRequestId(),
        },
      );
      record("rejected", "PERSISTED_NUMBER_OUT_OF_RANGE");
      return rejection as DomainResult<TResult>;
    }
    if (error instanceof PaymentIdentityConflictError) {
      const rejection = err(
        "PAYMENT_ALREADY_EXISTS",
        "This payment identity has already been recorded.",
        { requestId: currentRequestId() },
      );
      record("rejected", "PAYMENT_ALREADY_EXISTS");
      return rejection as DomainResult<TResult>;
    }
    if (error instanceof PersistedIntegrityError) {
      const rejection = err(
        error.code,
        "Stored quantity facts failed an integrity check. Contact support before retrying.",
        { requestId: currentRequestId() },
      );
      record("rejected", error.code);
      return rejection as DomainResult<TResult>;
    }
    if (error instanceof CommandIntegrityError) {
      const rejection = err(
        error.code,
        "Stored records failed an integrity check. Contact support before retrying.",
        { requestId: currentRequestId() },
      );
      record("rejected", error.code);
      return rejection as DomainResult<TResult>;
    }
    throw error;
  }
}

async function checkIdempotency<TResult>(args: {
  repos: Repositories;
  command: CommandEnvelope;
  commandType: string;
  payloadHash: string;
  resultSchema: z.ZodType<TResult>;
  receiptSchema?: z.ZodType | undefined;
  replayReceipt?: ((result: unknown) => DomainResult<TResult>) | undefined;
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

  if (existing.commandType !== args.commandType) {
    throw new RollbackForRejection(
      asRejection(
        err(
          "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_COMMAND",
          "This idempotency key was already used for a different command type.",
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

  const parsedResult = (args.receiptSchema ?? args.resultSchema).safeParse(existing.result);
  if (!parsedResult.success) {
    throw new RollbackForRejection(
      asRejection(
        err(
          "COMMAND_RECEIPT_RESULT_INVALID",
          "The stored command result no longer matches the current response contract.",
          { commandType: args.commandType },
        ),
      ),
    );
  }
  // Validate the persisted JSON, then return the original stored DTO. Zod
  // object schemas strip unknown keys by default; returning parsedResult.data
  // would silently change a previously accepted response on replay (for
  // example, legacy delivery actor attribution). The schema validation is the
  // safety boundary; preserving the stored value is the idempotency contract.
  if (args.replayReceipt !== undefined) return args.replayReceipt(parsedResult.data);
  return ok(existing.result as TResult);
}

function asRejection(result: DomainResult<never>): Extract<DomainResult<never>, { ok: false }> {
  if (result.ok) {
    throw new Error("asRejection called with a successful result.");
  }
  return result;
}
