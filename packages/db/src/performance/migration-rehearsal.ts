import { createDatabase } from "../client.ts";
import { repositoryMigrationCount, runMigrations } from "../migrate.ts";

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
const migrationCount = repositoryMigrationCount();
const priorMigrationCount = Math.max(1, migrationCount - 1);

try {
  await admin.sql.unsafe(`create database "${rehearsalName}"`);
  // Rehearse an adjacent upgrade with a row already present, then verify the
  // full current checkout can finish and remain idempotent. A fresh-only run
  // cannot catch a migration that mishandles existing production data.
  await runMigrations(rehearsalUrl.toString(), { migrationCount: priorMigrationCount });
  const prior = createDatabase(rehearsalUrl.toString(), { max: 1 });
  try {
    await prior.sql`
      insert into workspaces(id, name)
      values ('f2e00000-0000-4000-8000-000000000001'::uuid, 'upgrade-fixture')
    `;
  } finally {
    await prior.sql.end();
  }
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
    if (evidence === undefined || evidence.tables < 33 || evidence.migrations !== migrationCount) {
      throw new Error(`Fresh migration rehearsal incomplete: ${JSON.stringify(evidence)}`);
    }
    const fixture = await target.sql<{ count: number }[]>`
      select count(*)::int as count
      from workspaces
      where id='f2e00000-0000-4000-8000-000000000001'::uuid
        and name='upgrade-fixture'
    `;
    if (fixture[0]?.count !== 1) throw new Error("Upgrade fixture was not preserved.");
    console.warn(
      JSON.stringify({
        rehearsal: "adjacent_upgrade_and_idempotent_reapply",
        priorMigrations: priorMigrationCount,
        tables: evidence.tables,
        migrations: evidence.migrations,
        preservedRows: fixture[0]?.count ?? 0,
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
