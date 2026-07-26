import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.ts";

/**
 * Postgres connection and Drizzle instance.
 *
 * Supabase-compatible: it is a plain Postgres URL, so a Supabase connection
 * string works unchanged. Nothing here depends on Supabase's client library —
 * swapping the host is a configuration change, not a code change.
 */
export type Database = ReturnType<typeof createDatabase>;
export type DatabaseSchema = typeof schema;

export function createDatabase(connectionString: string, options?: { max?: number }) {
  const sql = postgres(connectionString, {
    max: options?.max ?? 10,
    // Integer money is read back as a JS number; postgres.js would otherwise hand
    // back bigint columns as strings and every amount would need re-parsing at
    // the call site, which is exactly where a parse gets forgotten.
    types: {
      bigint: postgres.BigInt,
    },
  });
  return { db: drizzle(sql, { schema }), sql };
}

export { schema };
