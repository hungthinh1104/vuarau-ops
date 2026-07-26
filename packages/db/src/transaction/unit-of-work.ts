import type { Database } from "../client.ts";
import { createRepositories, type IdMinter } from "../repositories/index.ts";

/**
 * One database transaction per command (BR-COMMAND-005).
 *
 * Everything a command writes — aggregate, ledger entries, summary, audit record,
 * command receipt — commits together or not at all. A confirmed order without its
 * ledger entry is corrupt data, and a partial failure is exactly when it would
 * happen.
 *
 * Isolation is Postgres's default READ COMMITTED. Lost updates are prevented by
 * `SELECT … FOR UPDATE` plus a version check (ADR-0009) rather than by
 * SERIALIZABLE, so a conflict surfaces as a precise `ORDER_VERSION_CONFLICT` the
 * UI can explain instead of a generic serialisation failure it cannot.
 *
 * The returned object satisfies `UnitOfWork` in `apps/api` structurally; this
 * package deliberately does not import that type.
 */
export function createUnitOfWork(database: Database["db"], ids: IdMinter) {
  return {
    async transaction<T>(
      work: (repos: ReturnType<typeof createRepositories>) => Promise<T>,
    ): Promise<T> {
      return database.transaction(async (tx) => {
        // The cast bridges Drizzle's fully-parameterised transaction type to the
        // loose one the repositories accept; the runtime object is the same.
        return work(createRepositories(tx as never, ids));
      });
    },
  };
}
