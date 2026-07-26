import type { Database } from "@vuarau/db";

/**
 * Whether this process may be sent traffic.
 *
 * Two things, in the order they fail: the configuration was accepted at startup
 * (if it had not been, this process would not exist), and the database answers a
 * trivial query. That second one is the whole reason readiness is separate from
 * liveness — a process whose database is unreachable is running perfectly and
 * cannot record a sale, and sending a worker to it loses their entry.
 *
 * `SELECT 1` rather than a table read: readiness must not depend on any depot's
 * data existing, and a query that touched a business table would report "not
 * ready" for a workspace that is merely empty.
 *
 * The failing check is named. Nothing about the database's contents, its host or
 * the driver's error text crosses this boundary — a readiness endpoint is
 * unauthenticated by necessity, so it is the one place a stack trace would be
 * published (BR-OPS-001).
 */
export type ReadinessResult = { readonly ok: boolean; readonly failing: string | null };

export async function checkReadiness(database: Database): Promise<ReadinessResult> {
  try {
    await database.sql`select 1`;
    return { ok: true, failing: null };
  } catch {
    return { ok: false, failing: "database" };
  }
}
