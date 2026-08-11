import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

export type WebE2eDatabaseSourceValidation =
  | { readonly ok: true; readonly source: URL; readonly databaseName: string }
  | { readonly ok: false; readonly reason: string };

export type WebE2eDatabase = {
  readonly targetUrl: string;
  readonly ownership: "wrapper" | "caller";
  readonly cleanup: () => boolean;
};

/**
 * The browser gate must never write to a development database or to the
 * shared functional-test database. It accepts only a local `_test` source
 * from which this wrapper can create an isolated target.
 */
export function validateWebE2eDatabaseSource(sourceUrl: string): WebE2eDatabaseSourceValidation {
  let source: URL;
  try {
    source = new URL(sourceUrl);
  } catch {
    return { ok: false, reason: "requires a valid PostgreSQL DATABASE_URL" };
  }

  if (!(source.protocol === "postgres:" || source.protocol === "postgresql:")) {
    return { ok: false, reason: "requires a PostgreSQL DATABASE_URL" };
  }

  if (!["localhost", "127.0.0.1", "::1"].includes(source.hostname)) {
    return { ok: false, reason: "requires a local PostgreSQL host" };
  }

  const databaseName = source.pathname.replace(/^\//, "");
  if (!databaseName.endsWith("_test") || !/^[a-z0-9_]+$/.test(databaseName)) {
    return { ok: false, reason: "requires a disposable database name ending in _test" };
  }

  return { ok: true, source, databaseName };
}

export function buildWebE2eDatabaseName(
  releaseSha: string,
  nonce = randomUUID().replaceAll("-", "").slice(0, 12),
): string {
  return `vuarau_e2e_${releaseSha.slice(0, 12)}_${nonce}_test`;
}

function createDisposableDatabase(sourceUrl: string, releaseSha: string): WebE2eDatabase | null {
  const validation = validateWebE2eDatabaseSource(sourceUrl);
  if (!validation.ok) {
    console.error(`web:e2e ${validation.reason}.`);
    process.exitCode = 2;
    return null;
  }

  const admin = new URL(validation.source.toString());
  admin.pathname = "/postgres";
  const databaseName = buildWebE2eDatabaseName(releaseSha);
  const created = spawnSync(
    "psql",
    [admin.toString(), "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE "${databaseName}"`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (created.status !== 0) {
    if (created.stderr.length > 0) process.stderr.write(created.stderr);
    console.error("web:e2e could not create its disposable PostgreSQL database.");
    process.exitCode = 2;
    return null;
  }

  const target = new URL(validation.source.toString());
  target.pathname = `/${databaseName}`;
  return {
    targetUrl: target.toString(),
    ownership: "wrapper",
    cleanup: (): boolean => {
      const dropped = spawnSync(
        "psql",
        [
          admin.toString(),
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          `DROP DATABASE "${databaseName}" WITH (FORCE)`,
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      if (dropped.status !== 0) {
        if (dropped.stderr.length > 0) process.stderr.write(dropped.stderr);
        console.error(`web:e2e could not clean up ${databaseName}.`);
        return false;
      }
      return true;
    },
  };
}

function callerOwnedDatabase(): WebE2eDatabase | null | undefined {
  const owner = process.env["E2E_DATABASE_OWNER"]?.trim() ?? "";
  const targetUrl = process.env["E2E_DATABASE_URL"]?.trim() ?? "";
  if (owner.length === 0 && targetUrl.length === 0) return undefined;

  if (owner !== "pilot-dry-run" || targetUrl.length === 0) {
    console.error("web:e2e only accepts E2E_DATABASE_URL with the internal pilot-dry-run owner.");
    process.exitCode = 2;
    return null;
  }

  const validation = validateWebE2eDatabaseSource(targetUrl);
  if (!validation.ok) {
    console.error(`web:e2e caller-owned database ${validation.reason}.`);
    process.exitCode = 2;
    return null;
  }

  return { targetUrl, ownership: "caller", cleanup: () => true };
}

function releaseSha(): string | null {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  if (result.status !== 0 || result.stdout.trim().length === 0) {
    console.error("web:e2e could not resolve the release SHA.");
    process.exitCode = 2;
    return null;
  }
  return result.stdout.trim();
}

function run(): void {
  const sha = releaseSha();
  if (sha === null) return;

  const callerDatabase = callerOwnedDatabase();
  if (callerDatabase === null) return;
  const database =
    callerDatabase ?? createDisposableDatabase(process.env["DATABASE_URL"]?.trim() ?? "", sha);
  if (database === null) return;

  let resultStatus = 1;
  try {
    const result = spawnSync("pnpm", ["--filter", "@vuarau/web", "e2e"], {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "test", DATABASE_URL: database.targetUrl },
    });
    if (result.error) {
      console.error(result.error);
    }
    resultStatus = result.status ?? 1;
  } finally {
    const cleanupSucceeded = database.cleanup();
    if (database.ownership === "wrapper" && !cleanupSucceeded) resultStatus = 1;
  }

  process.exitCode = resultStatus;
}

if (import.meta.url === `file://${process.argv[1]}`) run();
