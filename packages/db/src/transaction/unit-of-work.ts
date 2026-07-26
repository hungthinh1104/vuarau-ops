import type { Database } from "../client.ts";
import { createRepositories, type IdMinter } from "../repositories/index.ts";
import { createReadRepositories } from "../repositories/read-queries.ts";

/**
 * One database transaction per command (BR-COMMAND-005).
 *
 * Everything a command writes — aggregate, account entries, balance, audit
 * record, command receipt — commits together or not at all. A posted sale without
 * its account entry is corrupt data, and a partial failure is exactly when it
 * would happen.
 *
 * Reads run inside a transaction too, and share this one. A query authorized
 * against a membership that is revoked while the query is still running would
 * otherwise be possible: the check and the read have to see the same snapshot.
 *
 * Isolation is Postgres's default READ COMMITTED. Lost updates are prevented by
 * `SELECT … FOR UPDATE` plus a version check (ADR-0009) rather than by
 * SERIALIZABLE, so a conflict surfaces as a precise `SALE_VERSION_CONFLICT` the
 * UI can explain instead of a generic serialisation failure it cannot.
 *
 * The returned object satisfies `UnitOfWork` in `apps/api` structurally; this
 * package deliberately does not import that type.
 */
export function createUnitOfWork(database: Database["db"], ids: IdMinter) {
  return {
    async transaction<T>(
      work: (
        repos: ReturnType<typeof createRepositories> & ReturnType<typeof createReadRepositories>,
      ) => Promise<T>,
    ): Promise<T> {
      return database.transaction(async (tx) => {
        // The cast bridges Drizzle's fully-parameterised transaction type to the
        // loose one the repositories accept; the runtime object is the same.
        return work({
          ...createRepositories(tx as never, ids),
          ...createReadRepositories(tx as never),
        });
      });
    },
  };
}
