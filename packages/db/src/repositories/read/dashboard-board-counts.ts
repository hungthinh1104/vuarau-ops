import type { OperationsBoardCountsInput } from "@vuarau/domain-contracts";
import { sql } from "drizzle-orm";
import type { Tx } from "../shared/types.ts";
import { queryRows } from "./dashboard-rows.ts";

type BoardCountsResult = Awaited<ReturnType<typeof queryRows>>;
type CachedCounts = {
  revision: string;
  calculatedAt: string;
  nextDueAt: string | null;
  result: Pick<BoardCountsResult, "counts" | "statusCounts">;
};

/**
 * Counts are a workspace-wide aggregate. Keep a revision-aware snapshot so
 * opening the Board and its count strip do not repeat the same canonical
 * aggregate. The due-date boundary is part of validity: a cache entry is
 * never reused after the next receivable can become overdue.
 */
const countsCache = new Map<string, CachedCounts>();
const MAX_COUNT_CACHE_ENTRIES = 256;

async function currentRevision(tx: Tx, workspaceId: string): Promise<string> {
  const rows = await tx.execute(sql`
    select coalesce(max(revision), 0) as revision
    from workspace_change_feed
    where workspace_id=${workspaceId}::uuid
  `);
  return String((rows as Array<Record<string, unknown>>)[0]?.["revision"] ?? 0);
}

async function nextDueAt(tx: Tx, workspaceId: string, now: string): Promise<string | null> {
  const rows = await tx.execute(sql`
    select min(due_at) as next_due_at
    from sales
    where workspace_id=${workspaceId}::uuid
      and status='posted'
      and due_at > ${now}::timestamptz
  `);
  const value = (rows as Array<Record<string, unknown>>)[0]?.["next_due_at"];
  return value instanceof Date
    ? value.toISOString()
    : value === null || value === undefined
      ? null
      : String(value);
}

/**
 * Counts are the same Board facts as a page. Keep this adapter for the public
 * repository shape, but deliberately route it through the canonical row query
 * instead of maintaining a second SQL copy of delivery, return, receiving and
 * payment semantics.
 */
export async function queryOperationsBoardCounts(
  tx: Tx,
  input: OperationsBoardCountsInput & { readonly now: string },
) {
  // Search-specific counts remain uncached because their candidate scope is
  // already selective. The unsearched count strip is the hot path and is
  // safe to reuse until a command revision or due-date boundary.
  const cacheKey = input.search.length === 0 ? input.workspaceId : null;
  const revision = cacheKey === null ? null : await currentRevision(tx, input.workspaceId);
  const cached = cacheKey === null ? undefined : countsCache.get(cacheKey);
  if (
    cached !== undefined &&
    cached.revision === revision &&
    input.now >= cached.calculatedAt &&
    (cached.nextDueAt === null || input.now < cached.nextDueAt)
  ) {
    return cached.result;
  }
  const result = await queryRows(
    tx,
    {
      ...input,
      // The count strip describes the complete search scope, not the selected
      // chip. Preserve that contract at the repository boundary.
      filter: "all",
      sort: "updated_desc",
      cursor: null,
      limit: 1,
      page: { after: null, limit: 1 },
    },
    { includeActivity: false, includeCounts: true },
  );
  const value = { counts: result.counts, statusCounts: result.statusCounts };
  if (cacheKey !== null && revision !== null) {
    if (countsCache.size >= MAX_COUNT_CACHE_ENTRIES && !countsCache.has(cacheKey)) {
      const oldestKey = countsCache.keys().next().value;
      if (oldestKey !== undefined) countsCache.delete(oldestKey);
    }
    countsCache.set(cacheKey, {
      revision,
      calculatedAt: input.now,
      nextDueAt: await nextDueAt(tx, input.workspaceId, input.now),
      result: value,
    });
  }
  return value;
}
