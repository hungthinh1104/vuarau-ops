import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

/**
 * Runs the PostgreSQL project against a fresh local database. Migration
 * preflight must see real legacy data, so a stale shared test database is not a
 * safe substitute for a disposable one.
 */
function run(): void {
  const sourceUrl = process.env["DATABASE_URL"]?.trim();
  const database =
    sourceUrl === undefined || sourceUrl.length === 0 ? null : createDisposableDatabase(sourceUrl);

  if (sourceUrl !== undefined && sourceUrl.length > 0 && database === null) {
    process.exitCode = 2;
    return;
  }

  const environment = {
    ...process.env,
    NODE_ENV: "test",
    ...(database === null ? {} : { DATABASE_URL: database.targetUrl }),
  };
  const result = spawnSync(
    process.execPath,
    ["./node_modules/vitest/vitest.mjs", "run", "--project", "db"],
    { stdio: "inherit", env: environment },
  );

  const cleanupSucceeded = database?.cleanup() ?? true;
  process.exitCode = result.status === 0 && cleanupSucceeded ? 0 : 1;
}

function createDisposableDatabase(sourceUrl: string): {
  readonly targetUrl: string;
  readonly cleanup: () => boolean;
} | null {
  let source: URL;
  try {
    source = new URL(sourceUrl);
  } catch {
    console.error("test:db requires a valid PostgreSQL DATABASE_URL.");
    return null;
  }

  if (!["localhost", "127.0.0.1", "::1"].includes(source.hostname)) {
    console.error("test:db requires a local PostgreSQL host for disposable isolation.");
    return null;
  }

  const sourceName = source.pathname.replace(/^\//, "");
  if (!sourceName.endsWith("_test")) {
    console.error("test:db requires a source database name ending in _test.");
    return null;
  }

  const databaseName = `vuarau_${randomUUID().replaceAll("-", "").slice(0, 20)}_test`;
  const adminUrl = new URL(source.toString());
  adminUrl.pathname = "/postgres";
  const exists = spawnSync(
    "psql",
    [adminUrl.toString(), "-Atqc", `select 1 from pg_database where datname = '${databaseName}'`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (exists.status !== 0) {
    console.error("test:db could not connect to the local PostgreSQL admin database.");
    return null;
  }

  const created = spawnSync(
    "psql",
    [adminUrl.toString(), "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE "${databaseName}"`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (created.status !== 0) {
    console.error("test:db could not create its disposable database.");
    return null;
  }

  const targetUrl = new URL(source.toString());
  targetUrl.pathname = `/${databaseName}`;
  return {
    targetUrl: targetUrl.toString(),
    cleanup: (): boolean => {
      const dropped = spawnSync(
        "psql",
        [
          adminUrl.toString(),
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          `DROP DATABASE "${databaseName}" WITH (FORCE)`,
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      if (dropped.status !== 0) {
        console.error(`test:db could not clean up ${databaseName}.`);
        return false;
      }
      return true;
    },
  };
}

run();
