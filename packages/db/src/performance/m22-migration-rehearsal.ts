import { createDatabase } from "../client.ts";
import { runMigrations } from "../migrate.ts";

const DATABASE_URL = process.env["DATABASE_URL"];
if (DATABASE_URL === undefined) throw new Error("DATABASE_URL is required.");

const rehearsalName = `vuarau_m22_rehearsal_${process.pid}`;
if (!/^vuarau_m22_rehearsal_\d+$/.test(rehearsalName)) {
  throw new Error("Unsafe rehearsal database name.");
}

const adminUrl = new URL(DATABASE_URL);
const rehearsalUrl = new URL(DATABASE_URL);
rehearsalUrl.pathname = `/${rehearsalName}`;
const admin = createDatabase(adminUrl.toString(), { max: 1 });

try {
  await admin.sql.unsafe(`create database "${rehearsalName}"`);
  await runMigrations(rehearsalUrl.toString());
  await runMigrations(rehearsalUrl.toString());
  const target = createDatabase(rehearsalUrl.toString(), { max: 1 });
  try {
    const rows = await target.sql<{ tables: number; migrations: number }[]>`
      select
        (select count(*)::int from information_schema.tables
         where table_schema='public') tables,
        (select count(*)::int from drizzle.__drizzle_migrations) migrations
    `;
    const evidence = rows[0];
    if (evidence === undefined || evidence.tables < 33 || evidence.migrations < 21) {
      throw new Error(`Fresh migration rehearsal incomplete: ${JSON.stringify(evidence)}`);
    }
    console.warn(
      JSON.stringify({
        rehearsal: "fresh_migrations_and_idempotent_reapply",
        tables: evidence.tables,
        migrations: evidence.migrations,
        result: "pass",
      }),
    );
  } finally {
    await target.sql.end();
  }
} finally {
  await admin.sql.unsafe(`drop database if exists "${rehearsalName}" with (force)`);
  await admin.sql.end();
}
