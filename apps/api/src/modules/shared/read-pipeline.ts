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
import { ok } from "@vuarau/domain-kernel";
import type { Repositories, WorkspaceMembership } from "../../infrastructure/persistence/ports.ts";
import type { PageQuery, PageResult } from "../../infrastructure/persistence/read-ports.ts";
import type { CommandContext } from "./command-pipeline.ts";
import { authorizeWorkspaceAccess } from "./authorization.ts";

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

  // Inside the transaction, so the authorization check and the read it guards see
  // the same snapshot: a membership revoked mid-query cannot let the read finish.
  return ctx.deps.uow.transaction(async (repos) => {
    const authorized = await authorizeWorkspaceAccess({
      repos,
      principal: ctx.principal,
      workspaceId,
      permission,
    });
    if (!authorized.ok) {
      return authorized;
    }

    return ok(await execute({ repos, membership: authorized.value, asOf }));
  });
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
