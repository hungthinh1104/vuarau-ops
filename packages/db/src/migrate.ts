import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql as drizzleSql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { createDatabase } from "./client.ts";

const MIGRATIONS_FOLDER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Applies pending migrations. Safe to run repeatedly; Drizzle tracks what ran. */
export async function runMigrations(connectionString: string): Promise<void> {
  const { db, sql } = createDatabase(connectionString, { max: 1 });
  try {
    const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });

    // Drizzle's stock Postgres migrator compares only the newest `created_at`.
    // That silently skips a migration when parallel branches generated a lower
    // folder timestamp after a newer one was already applied. The journal order
    // and content hash are the durable identity of a migration, so reconcile by
    // hash instead while keeping the same migration table and SQL format.
    await db.execute(drizzleSql`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
    await db.execute(
      drizzleSql`CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        "id" serial PRIMARY KEY,
        "hash" text NOT NULL,
        "created_at" bigint
      )`,
    );

    await db.transaction(async (tx) => {
      await tx.execute(drizzleSql`SELECT pg_advisory_xact_lock(hashtext('vuarau:migrations'))`);
      const appliedRows = await tx.execute<{ hash: string }>(
        drizzleSql`SELECT "hash" FROM "drizzle"."__drizzle_migrations"`,
      );
      const appliedHashes = new Set(appliedRows.map((row) => row.hash));
      const knownHashes = new Set(migrations.map((migration) => migration.hash));
      const unknownHashes = [...appliedHashes].filter((hash) => !knownHashes.has(hash));
      if (unknownHashes.length > 0) {
        throw new Error(
          `Database contains ${unknownHashes.length} migration hash(es) unknown to this checkout.`,
        );
      }

      for (const migration of migrations) {
        if (appliedHashes.has(migration.hash)) continue;
        for (const statement of migration.sql) {
          await tx.execute(drizzleSql.raw(statement));
        }
        await tx.execute(
          drizzleSql`INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES (${migration.hash}, ${migration.folderMillis})`,
        );
        appliedHashes.add(migration.hash);
      }
    });
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.endsWith("migrate.ts") === true) {
  const url = process.env["DATABASE_URL"];
  if (url === undefined) {
    console.error("DATABASE_URL is not set. See .env.example.");
    process.exit(1);
  }
  await runMigrations(url);
  console.warn("Migrations applied.");
}
