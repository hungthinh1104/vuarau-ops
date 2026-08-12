import type {
  Cursor,
  IsoInstant,
  Page,
  PageRequest,
  Permission,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import { decodeCursor, encodeCursor } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import {
  ExactIntegerArithmeticError,
  ExactMoneyArithmeticError,
  err,
  ok,
} from "@vuarau/domain-kernel";
import { PersistedIntegrityError, PersistedNumberOutOfRangeError } from "@vuarau/db";
import type { Repositories, WorkspaceMembership } from "../../infrastructure/persistence/ports.ts";
import type { PageQuery, PageResult } from "../../infrastructure/persistence/read-ports.ts";
import type { CommandContext } from "./command-pipeline.ts";
import { authorizeWorkspaceAccess } from "./authorization.ts";
import { currentRequestId, log } from "../../infrastructure/logging.ts";

/**
 * The read counterpart of `runCommand`.
 *
 * It exists for the same reason: so that authorization, workspace scoping and the
 * transaction boundary cannot be forgotten by an individual query. Before
 * Milestone 1 the two account reads took a `workspaceId` and answered for
 * whatever it named, because isolation had been enforced on the write path only —
 * that is exactly the shape of mistake one query at a time produces.
 *
 * It is deliberately **not** `runCommand`. A read claims no idempotency key,
 * writes no receipt, and produces no audit record, and sharing the pipeline would
 * mean every read paying for machinery it does not use — and, worse, being one
 * `if` away from writing something.
 */
export async function runQuery<TResult>(args: {
  readonly ctx: CommandContext;
  readonly workspaceId: WorkspaceId;
  readonly permission: Permission;
  readonly execute: (context: {
    readonly repos: Repositories;
    readonly membership: WorkspaceMembership;
    /** The server clock, for the reads whose answer depends on "now" — `dueState`. */
    readonly asOf: IsoInstant;
  }) => Promise<TResult>;
}): Promise<DomainResult<TResult>> {
  const { ctx, workspaceId, permission, execute } = args;
  const asOf = ctx.deps.clock.now();
  const startedAt = Date.now();

  // Inside the transaction, so workspace-scoped reads and their authorization
  // stay within one database boundary. Reads use a non-locking membership lookup;
  // a report must not hold an actor row lock for the lifetime of a slow query.
  let result: DomainResult<TResult>;
  try {
    result = await ctx.deps.uow.transaction(
      async (repos) => {
        const authorized = await authorizeWorkspaceAccess({
          repos,
          principal: ctx.principal,
          workspaceId,
          permission,
          lockMembership: false,
        });
        if (!authorized.ok) {
          return authorized;
        }

        return ok(await execute({ repos, membership: authorized.value, asOf }));
      },
      { isolationLevel: "repeatable read" },
    );
  } catch (error) {
    if (
      error instanceof PersistedNumberOutOfRangeError ||
      error instanceof ExactMoneyArithmeticError ||
      error instanceof ExactIntegerArithmeticError
    ) {
      result = err(
        "PERSISTED_NUMBER_OUT_OF_RANGE",
        "Persisted numeric data is outside the supported range.",
        {
          field: error.field,
          requestId: currentRequestId(),
        },
      );
    } else if (error instanceof PersistedIntegrityError) {
      result = err(
        error.code,
        "Stored records failed an integrity check. Contact support before retrying.",
        { requestId: currentRequestId() },
      );
    } else {
      throw error;
    }
  }
  log({
    event: "query",
    requestId: currentRequestId(),
    queryType: permission,
    workspaceId,
    actorId: ctx.principal.actorId,
    outcome: result.ok ? "accepted" : "rejected",
    code: result.ok ? null : result.error.code,
    durationMs: Date.now() - startedAt,
  });
  return result;
}

/** Decodes the client's opaque cursor into the keyset position the ports take. */
export function toPageQuery(request: PageRequest): PageQuery {
  return { after: decodeCursor(request.cursor), limit: request.limit };
}

/**
 * Re-encodes the position the repository stopped at.
 *
 * The mapping from row to DTO happens here rather than in the repository, so the
 * cursor is derived from the same row the client is handed. Deriving it from the
 * DTO instead would let a field rename quietly change what a cursor means.
 */
export function toPage<TRow, TItem>(
  result: PageResult<TRow>,
  toItem: (row: TRow) => TItem,
): Page<TItem> {
  return {
    items: result.rows.map(toItem),
    nextCursor: result.next === null ? null : (encodeCursor(result.next) as Cursor),
  };
}
