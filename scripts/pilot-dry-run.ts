import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

type EvidenceStep = {
  readonly name: string;
  readonly command: readonly string[];
  readonly proves: readonly string[];
};

export type PilotDatabaseSourceValidation =
  { readonly ok: true; readonly source: URL } | { readonly ok: false; readonly error: string };

export type DisposablePilotDatabase = {
  readonly targetUrl: string;
  readonly cleanup: () => boolean;
};

const steps: readonly EvidenceStep[] = [
  {
    name: "pilot contracts and operator imports",
    command: [
      "exec",
      "vitest",
      "run",
      "--project",
      "application",
      "apps/api/src/operations/pilot-config.app.test.ts",
      "apps/api/src/operations/pilot-csv.app.test.ts",
      "apps/api/src/infrastructure/request-guard.app.test.ts",
      "apps/api/src/infrastructure/readiness.app.test.ts",
      "apps/api/src/operations/full-depot-day.app.test.ts",
    ],
    proves: [
      "fail-closed owner/provider declarations",
      "Customer/Product validation and deterministic identity",
      "oversized request, rate limiting, PostgreSQL-unavailable readiness",
      "one synthetic depot day keeps customer money, supplier money, inventory and fulfilment reconciled",
    ],
  },
  {
    name: "real PostgreSQL provisioning and import",
    command: [
      "exec",
      "vitest",
      "run",
      "--project",
      "db",
      "packages/db/src/provisioning.db.test.ts",
      "apps/api/src/infrastructure/persistence/drizzle/pilot-onboarding.db.test.ts",
    ],
    proves: [
      "atomic audited owner bootstrap",
      "duplicate-safe Customer/Product command replay",
      "workspace isolation and no partial invalid-file mutation",
    ],
  },
  {
    name: "public and authenticated trust boundaries",
    command: ["security:surface"],
    proves: ["authenticated command/query inventory and fixed public route inventory"],
  },
  {
    name: "disposable browser/API/PostgreSQL workflow",
    command: ["web:e2e"],
    proves: [
      "sign-in, Quick Sale, payment/reversal/correction",
      "supplier/purchase/receiving/inventory/delivery/return",
      "documents/share, reports, backup/restore/integrity/reconciliation",
      "duplicate tap, dropped response, stale version, permission and inactive-member failures",
    ],
  },
];

export function validatePilotDatabaseSource(sourceUrl: string): PilotDatabaseSourceValidation {
  let source: URL;
  try {
    source = new URL(sourceUrl);
  } catch {
    return { ok: false, error: "DATABASE_URL must be a valid PostgreSQL connection string." };
  }

  if (!(source.protocol === "postgres:" || source.protocol === "postgresql:")) {
    return { ok: false, error: "DATABASE_URL must use the postgres:// or postgresql:// scheme." };
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(source.hostname)) {
    return {
      ok: false,
      error:
        "pilot:dry-run requires a local PostgreSQL source database; remote databases are refused.",
    };
  }
  if (!source.pathname.replace(/^\//, "").endsWith("_test")) {
    return {
      ok: false,
      error:
        "pilot:dry-run requires a source database whose name ends in _test; development databases are refused.",
    };
  }
  return { ok: true, source };
}

export function createDisposablePilotDatabase(
  sourceUrl: string,
  releaseSha: string,
): DisposablePilotDatabase | null {
  const validation = validatePilotDatabaseSource(sourceUrl);
  if (!validation.ok) {
    console.error(validation.error);
    process.exitCode = 2;
    return null;
  }

  const databaseName = `vuarau_pilot_${releaseSha.slice(0, 12)}_${randomUUID().replaceAll("-", "").slice(0, 12)}_test`;
  const admin = new URL(validation.source.toString());
  admin.pathname = "/postgres";
  const created = spawnSync(
    "psql",
    [admin.toString(), "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE "${databaseName}"`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (created.status !== 0) {
    console.error("pilot:dry-run could not create its disposable PostgreSQL database.");
    process.exitCode = 2;
    return null;
  }

  const target = new URL(validation.source.toString());
  target.pathname = `/${databaseName}`;
  return {
    targetUrl: target.toString(),
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
        console.error("pilot:dry-run could not clean up its disposable PostgreSQL database.");
        return false;
      }
      return true;
    },
  };
}

function requiredEvidenceSourcesExist(): boolean {
  for (const required of [
    "apps/web/e2e/quick-sale.spec.ts",
    "apps/web/e2e/account-ledger.spec.ts",
    "apps/web/e2e/goods-flow.spec.ts",
    "apps/web/e2e/depot-operations.spec.ts",
    "apps/web/e2e/workspace-operations.spec.ts",
  ]) {
    if (!existsSync(required)) {
      console.error(`M23 dry-run evidence source missing: ${required}`);
      return false;
    }
  }
  return true;
}

function run(): void {
  if (!requiredEvidenceSourcesExist()) {
    process.exitCode = 2;
    return;
  }

  const release = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  if (release.status !== 0) {
    console.error(release.stderr);
    process.exitCode = 2;
    return;
  }
  const tree = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  if (tree.status !== 0 || tree.stdout.trim().length > 0) {
    console.error(
      "M23 dry-run requires a clean committed tree; otherwise the reported release SHA " +
        "does not identify the code under test.",
    );
    process.exitCode = 2;
    return;
  }

  const sourceUrl = process.env["DATABASE_URL"]?.trim();
  if (sourceUrl === undefined || sourceUrl.length === 0) {
    console.error("M23 dry-run requires DATABASE_URL for a disposable PostgreSQL source.");
    process.exitCode = 2;
    return;
  }
  const database = createDisposablePilotDatabase(sourceUrl, release.stdout.trim());
  if (database === null) return;

  const evidence: Array<{
    name: string;
    status: "pass" | "fail";
    proves: readonly string[];
  }> = [];
  let runStatus = 0;
  try {
    for (const step of steps) {
      console.warn(`\nM23 dry-run: ${step.name}`);
      const result = spawnSync("pnpm", step.command, {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: "test", DATABASE_URL: database.targetUrl },
        stdio: "inherit",
      });
      const passed = result.status === 0;
      evidence.push({
        name: step.name,
        status: passed ? "pass" : "fail",
        proves: step.proves,
      });
      if (!passed) {
        runStatus = 1;
        break;
      }
    }
  } finally {
    const cleanupSucceeded = database.cleanup();
    const repositoryReadiness =
      runStatus === 0 && evidence.length === steps.length && cleanupSucceeded ? "PASS" : "FAIL";
    const report = {
      kind: "M23_DISPOSABLE_DRY_RUN",
      releaseSha: release.stdout.trim(),
      database: "disposable-postgresql",
      generatedAt: new Date().toISOString(),
      evidence,
      repositoryReadiness,
      fieldValidation: "NOT_RUN_BY_AUTOMATION",
    };
    console.warn(`\n${JSON.stringify(report, null, 2)}`);
    process.exitCode = repositoryReadiness === "PASS" ? 0 : 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) run();
