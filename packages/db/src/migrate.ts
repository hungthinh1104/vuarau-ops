import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "./client.ts";

const MIGRATIONS_FOLDER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Applies pending migrations. Safe to run repeatedly; Drizzle tracks what ran. */
export async function runMigrations(connectionString: string): Promise<void> {
  const { db, sql } = createDatabase(connectionString, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
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
