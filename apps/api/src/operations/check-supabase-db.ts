import { createDatabase, migrationState } from "@vuarau/db";
import { databaseUrlUsesTls } from "../infrastructure/config.ts";

export type DatabaseTarget = {
  readonly host: string;
  readonly database: string;
  readonly isSupabase: boolean;
  readonly isLocal: boolean;
  readonly usesTls: boolean;
};

/**
 * Returns only connection facts safe to print. Credentials and query parameters
 * are deliberately discarded before an operator report is produced.
 */
export function inspectDatabaseTarget(databaseUrl: string): DatabaseTarget | null {
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return null;
    const host = parsed.hostname.toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
    const isSupabase = host.endsWith(".supabase.co") || host.endsWith(".pooler.supabase.com");
    return {
      host,
      database: parsed.pathname.replace(/^\//, "") || "(unnamed)",
      isSupabase,
      isLocal,
      usesTls: databaseUrlUsesTls(databaseUrl),
    };
  } catch {
    return null;
  }
}

export async function runSupabaseDatabaseCheck(
  env: Readonly<Record<string, string | undefined>>,
  report: (line: string) => void = console.warn,
  reportError: (line: string) => void = console.error,
): Promise<number> {
  const databaseUrl = env["DATABASE_URL"]?.trim() ?? "";
  if (databaseUrl.length === 0) {
    reportError("✗ DATABASE_URL is not set.");
    return 2;
  }

  const target = inspectDatabaseTarget(databaseUrl);
  if (target === null) {
    reportError("✗ DATABASE_URL is not a PostgreSQL connection string.");
    return 2;
  }

  report(`Database target: ${target.host}/${target.database}`);
  const failures: string[] = [];
  if (!target.isSupabase) {
    failures.push("DATABASE_URL does not target a Supabase Postgres host");
  }
  if (!target.usesTls) {
    failures.push("DATABASE_URL must declare sslmode=require, verify-ca or verify-full");
  }

  if (failures.length === 0) {
    const database = createDatabase(databaseUrl, { max: 1 });
    try {
      try {
        await database.sql`select 1`;
      } catch {
        failures.push("Supabase Postgres did not answer a read-only connectivity check");
      }

      if (failures.length === 0) {
        try {
          const state = await migrationState(database);
          if (state.missing.length > 0 || state.unknown > 0) {
            failures.push(
              `schema is not current (expected ${state.expected}, applied ${state.applied}, ` +
                `missing ${state.missing.length}, unknown ${state.unknown})`,
            );
          } else {
            report(`Schema current: ${state.applied}/${state.expected} migrations applied`);
          }
        } catch {
          failures.push(
            "could not inspect Supabase migration state without exposing database details",
          );
        }
      }
    } finally {
      await database.sql.end();
    }
  }

  if (failures.length > 0) {
    reportError("✗ Supabase database check failed:");
    for (const failure of failures) reportError(`  ${failure}`);
    return 1;
  }

  report("✓ Supabase Postgres target, TLS and migration state are usable.");
  return 0;
}

if (process.argv[1]?.endsWith("apps/api/src/operations/check-supabase-db.ts")) {
  process.exitCode = await runSupabaseDatabaseCheck(process.env);
}
