import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.ts";
import { persistedBigintToSafeNumber } from "./schema/safe-bigint.ts";

/**
 * Postgres connection and Drizzle instance.
 *
 * Supabase-compatible: it is a plain Postgres URL, so a Supabase connection
 * string works unchanged. Nothing here depends on Supabase's client library —
 * swapping the host is a configuration change, not a code change.
 */
export type Database = ReturnType<typeof createDatabase>;
export type DatabaseSchema = typeof schema;

const safePostgresBigint: postgres.PostgresType<number> = {
  to: 20,
  from: [20],
  serialize: (value) => String(value),
  parse: (raw) => persistedBigintToSafeNumber(raw, "postgres.bigint"),
};

export function createDatabase(connectionString: string, options?: { max?: number }) {
  const sql = postgres(connectionString, {
    max: options?.max ?? 10,
    // Check every int8 value, including raw SQL aggregates that do not pass
    // through a Drizzle column mapper. Never round a persisted value silently.
    types: {
      bigint: safePostgresBigint,
    },
  });
  return { db: drizzle(sql, { schema }), sql };
}

export { schema };
